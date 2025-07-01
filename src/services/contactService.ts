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
    const matchingContacts = await this.findMatchingContacts(
      email,
      phoneNumber
    );

    if (matchingContacts.length === 0) {
      return this.createNewPrimaryContact(email, phoneNumber);
    }

    const primaryContact = await this.resolvePrimaryContact(matchingContacts);
    const allRelatedContacts = await this.getAllRelatedContacts(
      primaryContact.id
    );

    const shouldCreateSecondary = this.shouldCreateSecondaryContact(
      allRelatedContacts,
      email,
      phoneNumber
    );

    if (shouldCreateSecondary) {
      const newSecondary = await this.createSecondaryContact(
        email,
        phoneNumber,
        primaryContact.id
      );
      allRelatedContacts.push(newSecondary);
    }

    return this.buildResponseFromContacts(allRelatedContacts);
  }

  /**
   * Finds all contacts that match the given email or phone number.
   */
  private async findMatchingContacts(
    email: string | null,
    phoneNumber: string | null
  ): Promise<Contact[]> {
    return await prisma.contact.findMany({
      where: {
        OR: [email ? { email } : {}, phoneNumber ? { phoneNumber } : {}].filter(
          (c) => Object.keys(c).length > 0
        ),
      },
    });
  }

  /**
   * Creates a new primary contact for a completely new customer.
   */
  private async createNewPrimaryContact(
    email: string | null,
    phoneNumber: string | null
  ): Promise<IdentifyResponse> {
    const newContact = await prisma.contact.create({
      data: {
        email,
        phoneNumber,
        linkPrecedence: "primary",
      },
    });
    return this.buildResponseFromContacts([newContact]);
  }

  /**
   * Resolves which contact should be the primary among matching contacts.
   * Handles merging multiple primary contacts if necessary.
   */
  private async resolvePrimaryContact(
    matchingContacts: Contact[]
  ): Promise<Contact> {
    const allPrimaryContactIds = await this.findAllPrimaryContactIds(
      matchingContacts
    );
    const allPrimaryContacts = await this.fetchPrimaryContacts(
      allPrimaryContactIds
    );

    if (allPrimaryContacts.length === 0) {
      return this.handleOrphanedSecondaries(matchingContacts);
    }

    if (allPrimaryContacts.length > 1) {
      await this.mergePrimaryContacts(allPrimaryContacts);
    }

    return allPrimaryContacts[0]; // Oldest primary
  }

  /**
   * Finds all unique primary contact IDs by traversing up from secondary contacts.
   */
  private async findAllPrimaryContactIds(
    matchingContacts: Contact[]
  ): Promise<Set<number>> {
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

    return allPrimaryContactIds;
  }

  /**
   * Fetches all primary contacts and orders them by creation date.
   */
  private async fetchPrimaryContacts(
    primaryContactIds: Set<number>
  ): Promise<Contact[]> {
    return await prisma.contact.findMany({
      where: { id: { in: Array.from(primaryContactIds) } },
      orderBy: { createdAt: "asc" },
    });
  }

  /**
   * Handles the case where all matching contacts are orphaned secondaries.
   */
  private async handleOrphanedSecondaries(
    matchingContacts: Contact[]
  ): Promise<Contact> {
    const oldestMatchedContact = [...matchingContacts].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
    )[0];

    if (oldestMatchedContact.linkPrecedence !== "primary") {
      return await prisma.contact.update({
        where: { id: oldestMatchedContact.id },
        data: { linkPrecedence: "primary", linkedId: null },
      });
    }

    return oldestMatchedContact;
  }

  /**
   * Merges multiple primary contacts by demoting all but the oldest to secondary.
   */
  private async mergePrimaryContacts(
    allPrimaryContacts: Contact[]
  ): Promise<void> {
    const primaryContact = allPrimaryContacts[0]; // Oldest
    const otherPrimaryIds = allPrimaryContacts.slice(1).map((p) => p.id);

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

  /**
   * Gets all contacts related to a primary contact.
   */
  private async getAllRelatedContacts(
    primaryContactId: number
  ): Promise<Contact[]> {
    return await prisma.contact.findMany({
      where: {
        OR: [{ id: primaryContactId }, { linkedId: primaryContactId }],
      },
    });
  }

  /**
   * Determines if a new secondary contact should be created.
   */
  private shouldCreateSecondaryContact(
    allRelatedContacts: Contact[],
    email: string | null,
    phoneNumber: string | null
  ): boolean {
    const allEmails = new Set(
      allRelatedContacts.map((c) => c.email).filter(Boolean) as string[]
    );
    const allPhones = new Set(
      allRelatedContacts.map((c) => c.phoneNumber).filter(Boolean) as string[]
    );

    const isNewEmail = email && !allEmails.has(email);
    const isNewPhone = phoneNumber && !allPhones.has(phoneNumber);

    return Boolean(isNewEmail || isNewPhone);
  }

  /**
   * Creates a new secondary contact.
   */
  private async createSecondaryContact(
    email: string | null,
    phoneNumber: string | null,
    primaryContactId: number
  ): Promise<Contact> {
    return await prisma.contact.create({
      data: {
        email,
        phoneNumber,
        linkedId: primaryContactId,
        linkPrecedence: "secondary",
      },
    });
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
