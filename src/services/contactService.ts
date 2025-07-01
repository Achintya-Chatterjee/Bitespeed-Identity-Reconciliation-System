import { PrismaClient, Contact } from "@prisma/client";
import { IdentifyResponse } from "../types/identify";

const prisma = new PrismaClient();

export class ContactService {
  /**
   * Identifies a customer based on email and/or phone number.
   * It will find existing contacts, merge them if necessary, create new contacts,
   * and return a consolidated view of the customer's identity.
   * @param email The email address of the contact.
   * @param phoneNumber The phone number of the contact.
   * @returns A promise that resolves to the consolidated contact response.
   */
  public async identify(
    email: string | null,
    phoneNumber: string | null
  ): Promise<IdentifyResponse> {
    // Find all contacts that have the same email or phone number as the request
    const matchingContacts = await prisma.contact.findMany({
      where: {
        OR: [email ? { email } : {}, phoneNumber ? { phoneNumber } : {}].filter(
          (c) => Object.keys(c).length > 0
        ),
      },
    });

    if (matchingContacts.length === 0) {
      // This is a new customer, create a primary contact
      const newContact = await prisma.contact.create({
        data: {
          email,
          phoneNumber,
          linkPrecedence: "primary",
        },
      });
      return this.buildResponseFromContacts([newContact]);
    }

    // 1. Find all unique primary contact IDs associated with the matches, traversing up from any secondary contacts.
    const allPrimaryContactIds = new Set<number>();
    const contactsToTrace = [...matchingContacts];
    const tracedIds = new Set<number>();

    while (contactsToTrace.length > 0) {
      const contact = contactsToTrace.pop()!;
      if (tracedIds.has(contact.id)) continue;
      tracedIds.add(contact.id);

      if (contact.linkPrecedence === "primary") {
        allPrimaryContactIds.add(contact.id);
      } else if (contact.linkedId) {
        const parent = await prisma.contact.findUnique({
          where: { id: contact.linkedId },
        });
        if (parent) {
          contactsToTrace.push(parent);
        }
      }
    }

    // 2. Fetch all primary contacts, find the oldest, and determine the true primary.
    const allPrimaryContacts = await prisma.contact.findMany({
      where: { id: { in: Array.from(allPrimaryContactIds) } },
      orderBy: { createdAt: "asc" },
    });

    let primaryContact: Contact;

    if (allPrimaryContacts.length > 0) {
      primaryContact = allPrimaryContacts[0];
      const otherPrimaryIds = allPrimaryContacts.slice(1).map((p) => p.id);
      if (otherPrimaryIds.length > 0) {
        // We have other primary contacts that need to be demoted.
        await prisma.contact.updateMany({
          where: {
            OR: [
              { id: { in: otherPrimaryIds } },
              { linkedId: { in: otherPrimaryIds } },
            ],
          },
          data: {
            linkedId: primaryContact.id,
            linkPrecedence: "secondary",
          },
        });
      }
    } else {
      // Fallback: This case can happen with inconsistent data (e.g., all matches are orphaned secondaries).
      // We will select the oldest contact from the original matches and promote it if necessary.
      const oldestMatchedContact = [...matchingContacts].sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
      )[0];
      if (oldestMatchedContact.linkPrecedence !== "primary") {
        primaryContact = await prisma.contact.update({
          where: { id: oldestMatchedContact.id },
          data: { linkPrecedence: "primary", linkedId: null },
        });
      } else {
        primaryContact = oldestMatchedContact;
      }
    }

    // Get all contacts related to our primary contact
    const allRelatedContacts = await prisma.contact.findMany({
      where: {
        OR: [{ id: primaryContact.id }, { linkedId: primaryContact.id }],
      },
    });

    const allEmails = new Set(
      allRelatedContacts.map((c) => c.email).filter(Boolean) as string[]
    );
    const allPhones = new Set(
      allRelatedContacts.map((c) => c.phoneNumber).filter(Boolean) as string[]
    );

    const isNewEmail = email && !allEmails.has(email);
    const isNewPhone = phoneNumber && !allPhones.has(phoneNumber);

    if (isNewEmail || isNewPhone) {
      // There is new information, create a secondary contact
      const newSecondaryContact = await prisma.contact.create({
        data: {
          email,
          phoneNumber,
          linkedId: primaryContact.id,
          linkPrecedence: "secondary",
        },
      });
      allRelatedContacts.push(newSecondaryContact);
    }

    return this.buildResponseFromContacts(allRelatedContacts);
  }

  /**
   * Finds the primary contact from a list of contacts.
   * If the list contains a primary contact, it's returned.
   * Otherwise, it finds the primary contact linked to the first secondary contact in the list.
   * @param contacts An array of contacts to search through.
   * @returns A promise that resolves to the primary contact.
   * @throws Will throw an error if data is inconsistent (e.g., secondary contact with no link).
   */
  private async getPrimaryContact(contacts: Contact[]): Promise<Contact> {
    let primaryContact = contacts.find((c) => c.linkPrecedence === "primary");
    if (primaryContact) {
      return primaryContact;
    }

    // All contacts are secondary, find their primary
    const linkedId = contacts[0].linkedId;
    if (!linkedId) {
      // This should not happen in consistent data, but as a fallback:
      throw new Error(
        "Data inconsistency: secondary contact without a linkedId"
      );
    }
    const parentContact = await prisma.contact.findUnique({
      where: { id: linkedId },
    });

    if (!parentContact) {
      throw new Error(
        `Data inconsistency: could not find primary contact with id ${linkedId}`
      );
    }
    return parentContact;
  }

  /**
   * Builds the final consolidated contact response object from a list of related contacts.
   * @param contacts An array of all contacts belonging to a single identity (one primary and its secondaries).
   * @returns The consolidated contact response.
   * @throws Will throw an error if the input array is empty.
   */
  private buildResponseFromContacts(contacts: Contact[]): IdentifyResponse {
    if (contacts.length === 0) {
      // This case should ideally not be hit if called correctly
      throw new Error("Cannot build response from empty contacts array");
    }

    const primaryContact =
      contacts.find((c) => c.linkPrecedence === "primary") ||
      [...contacts].sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
      )[0];

    const emails: string[] = [];
    const phoneNumbers: string[] = [];

    // Add primary contact's info first
    if (primaryContact.email && !emails.includes(primaryContact.email)) {
      emails.push(primaryContact.email);
    }
    if (
      primaryContact.phoneNumber &&
      !phoneNumbers.includes(primaryContact.phoneNumber)
    ) {
      phoneNumbers.push(primaryContact.phoneNumber);
    }

    // Add secondary contacts' info
    const secondaryContacts = contacts.filter(
      (c) => c.id !== primaryContact.id
    );
    secondaryContacts.forEach((contact) => {
      if (contact.email && !emails.includes(contact.email)) {
        emails.push(contact.email);
      }
      if (contact.phoneNumber && !phoneNumbers.includes(contact.phoneNumber)) {
        phoneNumbers.push(contact.phoneNumber);
      }
    });

    const secondaryContactIds = contacts
      .map((c) => c.id)
      .filter((id) => id !== primaryContact.id);

    return {
      contact: {
        primaryContactId: primaryContact.id,
        emails: emails,
        phoneNumbers: phoneNumbers,
        secondaryContactIds: secondaryContactIds,
      },
    };
  }
}
