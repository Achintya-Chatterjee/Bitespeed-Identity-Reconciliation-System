// Global test setup
beforeAll(() => {
  // Setup global test environment
  console.log("🧪 Setting up test environment...");
});

afterAll(() => {
  // Cleanup after all tests
  console.log("🧹 Cleaning up test environment...");
});

// Extend Jest matchers if needed
expect.extend({
  // Add custom matchers here if needed
});

// Global test timeout
jest.setTimeout(30000);
