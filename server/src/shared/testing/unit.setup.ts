// Mark this worker as database-free and remove integration database settings. An accidental Prisma
// import then fails because test database access requires TEST_TYPE to be integration.
process.env.TEST_TYPE = "unit";
delete process.env.TEST_DATABASE_WORKER_URL;
delete process.env.TEST_DATABASE_SCHEMA_PREFIX;
if (process.env.NODE_ENV !== "test") {
  throw new Error("Unit tests require NODE_ENV=test.");
}
