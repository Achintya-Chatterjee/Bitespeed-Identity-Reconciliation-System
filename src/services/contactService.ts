import { PrismaClient, Contact, LinkPrecedence } from "@prisma/client";
import { IdentifyResponse } from "../types/identify";

const prisma = new PrismaClient();

export class ContactService {
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
      });
      const oldestPrimary = allPrimaryContacts.sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
      )[0];
      const otherPrimaryIds = allPrimaryContacts
        .filter((c) => c.id !== oldestPrimary.id)
        .map((c) => c.id);

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

  private buildResponseFromContacts(contacts: Contact[]): IdentifyResponse {
    if (contacts.length === 0) {
      // This case should ideally not be hit if called correctly
      throw new Error("Cannot build response from empty contacts array");
    }

    const primaryContact =
      contacts.find((c) => c.linkPrecedence === "primary") ||
      contacts.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];

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
