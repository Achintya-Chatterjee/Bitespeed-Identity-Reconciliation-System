import request from "supertest";
import app from "../../src/index";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

describe("POST /identify", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    await prisma.contact.deleteMany();
  });

  afterAll(async () => {
    await prisma.contact.deleteMany();
    await prisma.$disconnect();
  });

  describe("successful identification", () => {
    it("should create a new primary contact when no existing contacts exist", async () => {
      const requestBody = {
        email: "doc.brown@flux.com",
        phoneNumber: "555-0001",
      };

      const response = await request(app)
        .post("/identify")
        .send(requestBody)
        .expect(200);

      expect(response.body).toHaveProperty("contact");
      expect(response.body.contact).toMatchObject({
        primaryContactId: expect.any(Number),
        emails: [requestBody.email],
        phoneNumbers: [requestBody.phoneNumber],
        secondaryContactIds: [],
      });

      const contactsInDb = await prisma.contact.findMany();
      expect(contactsInDb).toHaveLength(1);
      expect(contactsInDb[0]).toMatchObject({
        email: requestBody.email,
        phoneNumber: requestBody.phoneNumber,
        linkPrecedence: "primary",
        linkedId: null,
      });
    });

    it("should create a secondary contact when new information is added to existing identity", async () => {
      const primaryContact = await prisma.contact.create({
        data: {
          email: "doc.brown@flux.com",
          phoneNumber: "555-0001",
          linkPrecedence: "primary",
        },
      });

      const requestBody = {
        email: "emmett.brown@timemachine.com",
        phoneNumber: "555-0001",
      };

      const response = await request(app)
        .post("/identify")
        .send(requestBody)
        .expect(200);

      expect(response.body.contact).toMatchObject({
        primaryContactId: primaryContact.id,
        emails: expect.arrayContaining([
          "doc.brown@flux.com",
          "emmett.brown@timemachine.com",
        ]),
        phoneNumbers: ["555-0001"],
        secondaryContactIds: expect.any(Array),
      });

      const contactsInDb = await prisma.contact.findMany({
        orderBy: { createdAt: "asc" },
      });
      expect(contactsInDb).toHaveLength(2);
      expect(contactsInDb[1]).toMatchObject({
        email: requestBody.email,
        phoneNumber: requestBody.phoneNumber,
        linkPrecedence: "secondary",
        linkedId: primaryContact.id,
      });
    });

    it("should merge two primary contacts when they are linked by a request", async () => {
      const contact1 = await prisma.contact.create({
        data: {
          email: "doc.brown@flux.com",
          phoneNumber: "555-0001",
          linkPrecedence: "primary",
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      const contact2 = await prisma.contact.create({
        data: {
          email: "clara.clayton@hillvalley.edu",
          phoneNumber: "555-0002",
          linkPrecedence: "primary",
        },
      });

      const requestBody = {
        email: "clara.clayton@hillvalley.edu",
        phoneNumber: "555-0001",
      };

      const response = await request(app)
        .post("/identify")
        .send(requestBody)
        .expect(200);

      expect(response.body.contact).toMatchObject({
        primaryContactId: contact1.id,
        emails: expect.arrayContaining([
          "doc.brown@flux.com",
          "clara.clayton@hillvalley.edu",
        ]),
        phoneNumbers: expect.arrayContaining(["555-0001", "555-0002"]),
        secondaryContactIds: expect.arrayContaining([contact2.id]),
      });

      const updatedContact2 = await prisma.contact.findUnique({
        where: { id: contact2.id },
      });
      expect(updatedContact2).toMatchObject({
        linkPrecedence: "secondary",
        linkedId: contact1.id,
      });
    });

    it("should return existing consolidated contact when no new information is provided", async () => {
      const primaryContact = await prisma.contact.create({
        data: {
          email: "doc.brown@flux.com",
          phoneNumber: "555-0001",
          linkPrecedence: "primary",
        },
      });

      const secondaryContact = await prisma.contact.create({
        data: {
          email: "emmett.brown@timemachine.com",
          phoneNumber: "555-0001",
          linkedId: primaryContact.id,
          linkPrecedence: "secondary",
        },
      });

      const requestBody = {
        email: "doc.brown@flux.com",
        phoneNumber: "555-0001",
      };

      const response = await request(app)
        .post("/identify")
        .send(requestBody)
        .expect(200);

      expect(response.body.contact).toMatchObject({
        primaryContactId: primaryContact.id,
        emails: expect.arrayContaining([
          "doc.brown@flux.com",
          "emmett.brown@timemachine.com",
        ]),
        phoneNumbers: ["555-0001"],
        secondaryContactIds: [secondaryContact.id],
      });

      const contactsInDb = await prisma.contact.findMany();
      expect(contactsInDb).toHaveLength(2);
    });
  });

  describe("input validation", () => {
    it("should return 400 when both email and phoneNumber are missing", async () => {
      const response = await request(app)
        .post("/identify")
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty("message");
      expect(response.body.message).toContain(
        "Email or phone number must be provided"
      );
    });

    it("should return 400 when both email and phoneNumber are null", async () => {
      const response = await request(app)
        .post("/identify")
        .send({ email: null, phoneNumber: null })
        .expect(400);

      expect(response.body).toHaveProperty("message");
    });
  });

  describe("Server and Error Handling", () => {
    it("should redirect from the root path to /api-docs", async () => {
      await request(app).get("/").expect(302).expect("Location", "/api-docs");
    });

    it("should return 500 if the service throws an unexpected error", async () => {
      const { ContactService } = await import(
        "../../src/services/contactService"
      );
      const identifySpy = jest
        .spyOn(ContactService.prototype, "identify")
        .mockRejectedValueOnce(new Error("Internal DB Failure"));

      const requestBody = { email: "test@example.com" };

      const response = await request(app)
        .post("/identify")
        .send(requestBody)
        .expect(500);

      expect(response.body).toHaveProperty("message", "Internal Server Error");

      identifySpy.mockRestore();
    });
  });

  describe("single field requests", () => {
    it("should work with email only", async () => {
      const existingContact = await prisma.contact.create({
        data: {
          email: "doc.brown@flux.com",
          phoneNumber: "555-0001",
          linkPrecedence: "primary",
        },
      });

      const requestBody = {
        email: "doc.brown@flux.com",
      };

      const response = await request(app)
        .post("/identify")
        .send(requestBody)
        .expect(200);

      expect(response.body.contact.primaryContactId).toBe(existingContact.id);
    });

    it("should work with phoneNumber only", async () => {
      const existingContact = await prisma.contact.create({
        data: {
          email: "doc.brown@flux.com",
          phoneNumber: "555-0001",
          linkPrecedence: "primary",
        },
      });

      const requestBody = {
        phoneNumber: "555-0001",
      };

      const response = await request(app)
        .post("/identify")
        .send(requestBody)
        .expect(200);

      expect(response.body.contact.primaryContactId).toBe(existingContact.id);
    });
  });
});
