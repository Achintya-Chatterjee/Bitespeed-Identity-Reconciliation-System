import { ContactService } from "../../src/services/contactService";
import { prismaMock } from "../mocks/prismaClient";
import {
  mockContacts,
  mockSeparatePrimaryContact,
  createMockContact,
  testScenarios,
} from "../fixtures/contactData";
import { Contact, LinkPrecedence } from "@prisma/client";

jest.mock("@prisma/client", () => {
  const { prismaMock: mock } = require("../mocks/prismaClient");
  return {
    PrismaClient: jest.fn().mockImplementation(() => mock),
  };
});

describe("ContactService", () => {
  let contactService: ContactService;

  beforeEach(() => {
    contactService = new ContactService();
  });

  describe("identify", () => {
    describe("when no existing contacts are found", () => {
      it("should create a new primary contact", async () => {
        const { email, phoneNumber } = testScenarios.newContact;
        const newContact = createMockContact({
          id: 1,
          email,
          phoneNumber,
          linkPrecedence: "primary",
        });

        prismaMock.contact.findMany.mockResolvedValue([]);
        prismaMock.contact.create.mockResolvedValue(newContact);

        const result = await contactService.identify(email, phoneNumber);

        expect(prismaMock.contact.findMany).toHaveBeenCalledWith({
          where: {
            OR: [{ email }, { phoneNumber }],
          },
        });
        expect(prismaMock.contact.create).toHaveBeenCalledWith({
          data: {
            email,
            phoneNumber,
            linkPrecedence: "primary",
          },
        });
        expect(result).toEqual({
          contact: {
            primaryContactId: 1,
            emails: [email],
            phoneNumbers: [phoneNumber],
            secondaryContactIds: [],
          },
        });
      });
    });

    describe("when existing contacts are found", () => {
      it("should create a secondary contact when new information is provided", async () => {
        const { email, phoneNumber } = testScenarios.existingEmail;
        const primaryContact = mockContacts[0];
        const newSecondaryContact = createMockContact({
          id: 4,
          email,
          phoneNumber,
          linkedId: primaryContact.id,
          linkPrecedence: "secondary",
        });

        prismaMock.contact.findMany.mockResolvedValueOnce([primaryContact]);
        prismaMock.contact.findUnique.mockResolvedValue(primaryContact);
        prismaMock.contact.findMany.mockResolvedValueOnce([primaryContact]);
        prismaMock.contact.findMany.mockResolvedValueOnce(mockContacts);

        prismaMock.contact.create.mockResolvedValue(newSecondaryContact);

        const result = await contactService.identify(email, phoneNumber);

        expect(prismaMock.contact.create).toHaveBeenCalled();
        expect(result.contact.primaryContactId).toBe(primaryContact.id);
        expect(result.contact.emails).toContain(email);
        expect(result.contact.phoneNumbers).toContain(phoneNumber);
      });

      it("should not create a duplicate contact when no new information is provided", async () => {
        const primaryContact = mockContacts[0];
        const { email, phoneNumber } = primaryContact;

        prismaMock.contact.findMany.mockResolvedValueOnce(mockContacts);
        prismaMock.contact.findUnique.mockResolvedValue(primaryContact);
        prismaMock.contact.findMany.mockResolvedValueOnce([primaryContact]);
        prismaMock.contact.findMany.mockResolvedValueOnce(mockContacts);

        const result = await contactService.identify(email, phoneNumber);

        expect(prismaMock.contact.create).not.toHaveBeenCalled();
        expect(result.contact.primaryContactId).toBe(primaryContact.id);
      });
    });

    describe("when merging two primary contacts", () => {
      it("should make the newer primary contact secondary to the older one", async () => {
        const { email, phoneNumber } = testScenarios.linkingIdentities;
        const olderPrimary = mockContacts[0];
        const newerPrimary = mockSeparatePrimaryContact;

        prismaMock.contact.findMany.mockResolvedValueOnce([
          olderPrimary,
          newerPrimary,
        ]);
        prismaMock.contact.findMany.mockResolvedValueOnce([
          olderPrimary,
          newerPrimary,
        ]);
        prismaMock.contact.findMany.mockResolvedValueOnce([
          ...mockContacts,
          {
            ...newerPrimary,
            linkPrecedence: "secondary",
            linkedId: olderPrimary.id,
          },
        ]);

        const result = await contactService.identify(email, phoneNumber);

        expect(prismaMock.contact.updateMany).toHaveBeenCalled();
        expect(result.contact.primaryContactId).toBe(olderPrimary.id);
      });
    });

    describe("when handling orphaned secondary contacts", () => {
      it("should promote the oldest secondary contact to primary if no primary is found", async () => {
        const orphaned1 = createMockContact({
          id: 100,
          linkPrecedence: "secondary" as LinkPrecedence,
          linkedId: 999,
          createdAt: new Date("2023-01-01"),
        });
        const orphaned2 = createMockContact({
          id: 101,
          linkPrecedence: "secondary" as LinkPrecedence,
          linkedId: 999,
          createdAt: new Date("2023-01-02"),
        });
        const promotedContact = {
          ...orphaned1,
          linkPrecedence: "primary" as LinkPrecedence,
          linkedId: null,
        };

        prismaMock.contact.findMany.mockResolvedValueOnce([
          orphaned1,
          orphaned2,
        ]);
        prismaMock.contact.findUnique.mockResolvedValue(null);
        prismaMock.contact.update.mockResolvedValue(promotedContact);
        prismaMock.contact.findMany.mockResolvedValueOnce([]);
        prismaMock.contact.findMany.mockResolvedValueOnce([promotedContact]);

        const result = await contactService.identify(
          orphaned1.email,
          orphaned1.phoneNumber
        );

        expect(prismaMock.contact.update).toHaveBeenCalledWith({
          where: { id: orphaned1.id },
          data: { linkPrecedence: "primary" as LinkPrecedence, linkedId: null },
        });
        expect(result.contact.primaryContactId).toBe(orphaned1.id);
      });

      it("should handle the fallback case where the oldest matched contact is already primary", async () => {
        const oldestIsPrimary = createMockContact({
          id: 200,
          linkPrecedence: "primary" as LinkPrecedence,
          createdAt: new Date("2023-01-01"),
        });

        prismaMock.contact.findMany.mockResolvedValueOnce([oldestIsPrimary]);
        prismaMock.contact.findUnique.mockResolvedValue(null);
        prismaMock.contact.findMany.mockResolvedValueOnce([]);
        prismaMock.contact.findMany.mockResolvedValueOnce([oldestIsPrimary]);

        const result = await contactService.identify(
          oldestIsPrimary.email,
          oldestIsPrimary.phoneNumber
        );

        expect(prismaMock.contact.update).not.toHaveBeenCalled();
        expect(result.contact.primaryContactId).toBe(oldestIsPrimary.id);
      });
    });

    describe("error handling", () => {
      it("should handle database errors gracefully", async () => {
        const { email, phoneNumber } = testScenarios.newContact;
        prismaMock.contact.findMany.mockRejectedValue(
          new Error("Database error")
        );

        await expect(
          contactService.identify(email, phoneNumber)
        ).rejects.toThrow("Database error");
      });
    });
  });

  describe("buildResponseFromContacts (private method access for testing)", () => {
    it("should throw an error if called with an empty array", () => {
      const service = contactService as any;
      expect(() => service.buildResponseFromContacts([])).toThrow(
        "Cannot build response from empty contacts array"
      );
    });

    it("should find the oldest contact as primary if no primary contact exists", () => {
      const secondary1 = createMockContact({
        id: 1,
        linkPrecedence: "secondary",
        createdAt: new Date("2023-01-01"),
      });
      const secondary2 = createMockContact({
        id: 2,
        linkPrecedence: "secondary",
        createdAt: new Date("2023-01-02"),
      });
      const service = contactService as any;

      const response = service.buildResponseFromContacts([
        secondary2,
        secondary1,
      ]);

      expect(response.contact.primaryContactId).toBe(1);
    });

    it("should correctly sort emails and phoneNumbers with the primary info first", () => {
      const service = contactService as any;
      const primary = createMockContact({
        id: 1,
        email: "primary@email.com",
        phoneNumber: "111",
        createdAt: new Date("2023-01-01"),
      });
      const secondary = createMockContact({
        id: 2,
        email: "secondary@email.com",
        phoneNumber: "222",
        linkPrecedence: "secondary",
        linkedId: 1,
        createdAt: new Date("2023-01-02"),
      });

      const response = service.buildResponseFromContacts([secondary, primary]);

      expect(response.contact.emails[0]).toBe("primary@email.com");
      expect(response.contact.phoneNumbers[0]).toBe("111");
    });
  });

  describe("edge cases", () => {
    it("should handle null email", async () => {
      const phoneNumber = "555-0001";
      const existingContact = mockContacts[0];

      prismaMock.contact.findMany.mockResolvedValueOnce([existingContact]);
      prismaMock.contact.findUnique.mockResolvedValue(existingContact);
      prismaMock.contact.findMany.mockResolvedValueOnce([existingContact]);
      prismaMock.contact.findMany.mockResolvedValueOnce(mockContacts);

      const result = await contactService.identify(null, phoneNumber);

      expect(result.contact.primaryContactId).toBe(existingContact.id);
    });

    it("should handle null phoneNumber", async () => {
      const email = "emmett.brown@flux.com";
      const existingContact = mockContacts[0];

      prismaMock.contact.findMany.mockResolvedValueOnce([existingContact]);
      prismaMock.contact.findUnique.mockResolvedValue(existingContact);
      prismaMock.contact.findMany.mockResolvedValueOnce([existingContact]);
      prismaMock.contact.findMany.mockResolvedValueOnce(mockContacts);

      const result = await contactService.identify(email, null);

      expect(result.contact.primaryContactId).toBe(existingContact.id);
    });
  });
});
