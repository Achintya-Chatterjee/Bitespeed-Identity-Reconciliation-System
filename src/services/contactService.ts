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

    // We have existing contacts, let's figure out the primary
    let primaryContact = await this.getPrimaryContact(matchingContacts);

    // Check if we need to merge two different primary contacts
    const primaryContactsInMatch = [
      ...new Set(
        matchingContacts
          .filter((c) => c.linkPrecedence === "primary")
          .map((c) => c.id)
      ),
    ];
    if (primaryContactsInMatch.length > 1) {
      const allPrimaryContacts = await prisma.contact.findMany({
        where: { id: { in: primaryContactsInMatch } },
        orderBy: { createdAt: "asc" },
      });
      const oldestPrimary = allPrimaryContacts[0];
      const otherPrimaryIds = allPrimaryContacts.slice(1).map((c) => c.id);

      // The newer primary contact and all its children should now point to the oldest primary
      await prisma.contact.updateMany({
        where: {
          OR: [
            { id: { in: otherPrimaryIds } },
            { linkedId: { in: otherPrimaryIds } },
          ],
        },
        data: {
          linkedId: oldestPrimary.id,
          linkPrecedence: "secondary",
        },
      });
      primaryContact = oldestPrimary;
    }

    // Get all contacts related to our primary contact
    const allRelatedContacts = await prisma.contact.findMany({
      where: {
        OR: [{ id: primaryContact.id }, { linkedId: primaryContact.id }],
      },
    });

    const allEmails = new Set(
      allRelatedContacts.map((c) => c.email).filter(Boolean)
    );
    const allPhones = new Set(
      allRelatedContacts.map((c) => c.phoneNumber).filter(Boolean)
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

    const emails = [
      ...new Set(contacts.map((c) => c.email).filter(Boolean)),
    ] as string[];
    const phoneNumbers = [
      ...new Set(contacts.map((c) => c.phoneNumber).filter(Boolean)),
    ] as string[];

    // Ensure primary contact's info is first
    const primaryEmail = primaryContact.email;
    const primaryPhone = primaryContact.phoneNumber;

    const sortedEmails = [
      primaryEmail,
      ...emails.filter((e) => e !== primaryEmail),
    ];
    const sortedPhones = [
      primaryPhone,
      ...phoneNumbers.filter((p) => p !== primaryPhone),
    ];

    const secondaryContactIds = contacts
      .map((c) => c.id)
      .filter((id) => id !== primaryContact.id);

    return {
      contact: {
        primaryContactId: primaryContact.id,
        emails: sortedEmails.filter(Boolean) as string[],
        phoneNumbers: sortedPhones.filter(Boolean) as string[],
        secondaryContactIds: secondaryContactIds,
      },
    };
  }
}
