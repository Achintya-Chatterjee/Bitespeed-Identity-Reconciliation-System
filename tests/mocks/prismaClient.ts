import { mockDeep, mockReset, DeepMockProxy } from "jest-mock-extended";
import { PrismaClient } from "@prisma/client";

// Create a deep mock of PrismaClient
export const prismaMock = mockDeep<PrismaClient>();

// Reset the mock before each test
beforeEach(() => {
  mockReset(prismaMock);
});

// Export type for better TypeScript support
export type MockPrismaClient = DeepMockProxy<PrismaClient>;
