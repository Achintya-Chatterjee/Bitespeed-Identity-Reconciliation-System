import { ContactService } from "../../src/services/contactService";
import { prismaMock } from "../mocks/prismaClient";
import {
  mockContacts,
  mockSeparatePrimaryContact,
  createMockContact,
  testScenarios,
} from "../fixtures/contactData";

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
        const existingContacts = [primaryContact];
        const allRelatedContacts = [...mockContacts];
        const newSecondaryContact = createMockContact({
          id: 4,
          email,
          phoneNumber,
          linkedId: primaryContact.id,
          linkPrecedence: "secondary",
        });

        prismaMock.contact.findMany
          .mockResolvedValueOnce(existingContacts)
          .mockResolvedValueOnce(allRelatedContacts);
        prismaMock.contact.create.mockResolvedValue(newSecondaryContact);

        const result = await contactService.identify(email, phoneNumber);

        expect(prismaMock.contact.create).toHaveBeenCalledWith({
          data: {
            email,
            phoneNumber,
            linkedId: primaryContact.id,
            linkPrecedence: "secondary",
          },
        });
        expect(result.contact.primaryContactId).toBe(primaryContact.id);
        expect(result.contact.emails).toContain(email);
        expect(result.contact.phoneNumbers).toContain(phoneNumber);
      });

      it("should not create a duplicate contact when no new information is provided", async () => {
        const primaryContact = mockContacts[0];
        const { email, phoneNumber } = primaryContact;
        const existingContacts = [primaryContact];
        const allRelatedContacts = mockContacts;

        prismaMock.contact.findMany
          .mockResolvedValueOnce(existingContacts)
          .mockResolvedValueOnce(allRelatedContacts);

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
        const matchingContacts = [olderPrimary, newerPrimary];
        const allPrimaryContacts = [olderPrimary, newerPrimary];
        const allRelatedContacts = [...mockContacts, newerPrimary];

        prismaMock.contact.findMany
          .mockResolvedValueOnce(matchingContacts)
          .mockResolvedValueOnce(allPrimaryContacts)
          .mockResolvedValueOnce(allRelatedContacts);

        const result = await contactService.identify(email, phoneNumber);

        expect(prismaMock.contact.updateMany).toHaveBeenCalledWith({
          where: {
            OR: [
              { id: { in: [newerPrimary.id] } },
              { linkedId: { in: [newerPrimary.id] } },
            ],
          },
          data: {
            linkedId: olderPrimary.id,
            linkPrecedence: "secondary",
          },
        });
        expect(result.contact.primaryContactId).toBe(olderPrimary.id);
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

  describe("getPrimaryContact (private method access for testing)", () => {
    it("should throw an error if a secondary contact has no linkedId", async () => {
      const secondaryContactWithoutLink = createMockContact({
        linkPrecedence: "secondary",
        linkedId: null,
      });
      const service = contactService as any;
      await expect(
        service.getPrimaryContact([secondaryContactWithoutLink])
      ).rejects.toThrow(
        "Data inconsistency: secondary contact without a linkedId"
      );
    });

    it("should throw an error if the linked primary contact is not found", async () => {
      const secondaryContactWithMissingLink = createMockContact({
        linkPrecedence: "secondary",
        linkedId: 12345,
      });
      prismaMock.contact.findUnique.mockResolvedValue(null);
      const service = contactService as any;
      await expect(
        service.getPrimaryContact([secondaryContactWithMissingLink])
      ).rejects.toThrow(
        "Data inconsistency: could not find primary contact with id 12345"
      );
    });

    it("should return the primary contact when a valid secondary contact is provided", async () => {
      const primaryContact = createMockContact({
        id: 50,
        linkPrecedence: "primary",
      });
      const secondaryContact = createMockContact({
        id: 51,
        linkPrecedence: "secondary",
        linkedId: 50,
      });
      prismaMock.contact.findUnique.mockResolvedValue(primaryContact);
      const service = contactService as any;

      const result = await service.getPrimaryContact([secondaryContact]);

      expect(result).toBe(primaryContact);
      expect(prismaMock.contact.findUnique).toHaveBeenCalledWith({
        where: { id: 50 },
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
  });

  describe("edge cases", () => {
    it("should handle null email", async () => {
      const phoneNumber = "555-0001";
      const existingContact = mockContacts[0];
      const allRelatedContacts = mockContacts;

      prismaMock.contact.findMany
        .mockResolvedValueOnce([existingContact])
        .mockResolvedValueOnce(allRelatedContacts);

      const result = await contactService.identify(null, phoneNumber);

      expect(result.contact.primaryContactId).toBe(existingContact.id);
      expect(prismaMock.contact.findMany).toHaveBeenCalledWith({
        where: {
          OR: [{ phoneNumber }],
        },
      });
    });

    it("should handle null phoneNumber", async () => {
      const email = "emmett.brown@flux.com";
      const existingContact = mockContacts[0];
      const allRelatedContacts = mockContacts;

      prismaMock.contact.findMany
        .mockResolvedValueOnce([existingContact])
        .mockResolvedValueOnce(allRelatedContacts);

      const result = await contactService.identify(email, null);

      expect(result.contact.primaryContactId).toBe(existingContact.id);
      expect(prismaMock.contact.findMany).toHaveBeenCalledWith({
        where: {
          OR: [{ email }],
        },
      });
    });
  });
});
