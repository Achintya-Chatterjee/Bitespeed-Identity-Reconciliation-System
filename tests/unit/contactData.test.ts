import { createMockContact } from "../fixtures/contactData";

describe("contactData fixtures", () => {
  describe("createMockContact", () => {
    it("should create a default mock contact when no overrides are provided", () => {
      const contact = createMockContact();
      expect(contact).toBeDefined();
      expect(contact.id).toBe(999);
      expect(contact.email).toBe("test@example.com");
    });

    it("should apply overrides correctly", () => {
      const contact = createMockContact({
        id: 123,
        email: "override@test.com",
      });
      expect(contact.id).toBe(123);
      expect(contact.email).toBe("override@test.com");
    });
  });
});
