import { Contact, LinkPrecedence } from "@prisma/client";

export const mockContacts: Contact[] = [
  {
    id: 1,
    phoneNumber: "555-0001",
    email: "emmett.brown@flux.com",
    linkedId: null,
    linkPrecedence: "primary" as LinkPrecedence,
    createdAt: new Date("2023-04-01T00:00:00.374Z"),
    updatedAt: new Date("2023-04-01T00:00:00.374Z"),
    deletedAt: null,
  },
  {
    id: 2,
    phoneNumber: "555-0001",
    email: "doc.brown@timemachine.com",
    linkedId: 1,
    linkPrecedence: "secondary" as LinkPrecedence,
    createdAt: new Date("2023-04-02T00:00:00.374Z"),
    updatedAt: new Date("2023-04-02T00:00:00.374Z"),
    deletedAt: null,
  },
  {
    id: 3,
    phoneNumber: "555-0002",
    email: "emmett.brown@flux.com",
    linkedId: 1,
    linkPrecedence: "secondary" as LinkPrecedence,
    createdAt: new Date("2023-04-03T00:00:00.374Z"),
    updatedAt: new Date("2023-04-03T00:00:00.374Z"),
    deletedAt: null,
  },
];

export const mockSeparatePrimaryContact: Contact = {
  id: 4,
  phoneNumber: "555-0003",
  email: "clara.clayton@hillvalley.edu",
  linkedId: null,
  linkPrecedence: "primary" as LinkPrecedence,
  createdAt: new Date("2023-04-04T00:00:00.374Z"),
  updatedAt: new Date("2023-04-04T00:00:00.374Z"),
  deletedAt: null,
};

export const createMockContact = (
  overrides: Partial<Contact> = {}
): Contact => ({
  id: 999,
  phoneNumber: "555-9999",
  email: "test@example.com",
  linkedId: null,
  linkPrecedence: "primary" as LinkPrecedence,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  ...overrides,
});

export const testScenarios = {
  newContact: {
    email: "new.user@example.com",
    phoneNumber: "555-NEW1",
  },
  existingEmail: {
    email: "emmett.brown@flux.com",
    phoneNumber: "555-NEW2",
  },
  existingPhone: {
    email: "new.email@example.com",
    phoneNumber: "555-0001",
  },
  linkingIdentities: {
    email: "clara.clayton@hillvalley.edu",
    phoneNumber: "555-0001",
  },
};
