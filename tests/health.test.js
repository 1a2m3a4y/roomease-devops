/**
 * RoomEase — Health & API Test Suite
 * Run: npm test
 */

const request = require("supertest");

// Build a realistic mongoose mock that handles Schema.Types.ObjectId
jest.mock("mongoose", () => {
  // Fake Schema constructor
  function FakeSchema(def) {
    this.definition = def;
  }
  FakeSchema.Types = {
    ObjectId: "ObjectId", // placeholder type
  };

  // Fake model — returns a constructor function with static query methods
  const fakeModel = () => {
    const Model = function (data) { return data; };
    Model.find = jest.fn().mockReturnValue({ sort: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue([]) }) });
    Model.findById = jest.fn().mockResolvedValue(null);
    Model.findOne = jest.fn().mockResolvedValue(null);
    Model.findByIdAndUpdate = jest.fn().mockResolvedValue(null);
    Model.findByIdAndDelete = jest.fn().mockResolvedValue(null);
    Model.create = jest.fn().mockResolvedValue({});
    Model.countDocuments = jest.fn().mockResolvedValue(0);
    Model.aggregate = jest.fn().mockResolvedValue([]);
    Model.distinct = jest.fn().mockResolvedValue([]);
    Model.deleteMany = jest.fn().mockResolvedValue({});
    Model.updateMany = jest.fn().mockResolvedValue({});
    return Model;
  };

  const mConnection = {
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(true),
  };

  return {
    connect: jest.fn().mockResolvedValue(true),
    connection: mConnection,
    Schema: FakeSchema,
    model: jest.fn(fakeModel),
  };
});

// Now require app (after mocks are in place)
let app;
let server;

beforeAll(() => {
  // Set test env
  process.env.NODE_ENV = "test";
  process.env.MONGO_URI = "mongodb://localhost:27017/test";
  process.env.PORT = "0"; // Random port

  const mod = require("../app");
  app = mod.app;
  server = mod.server;
});

afterAll((done) => {
  if (server && server.close) {
    server.close(done);
  } else {
    done();
  }
});

// ── Health Endpoints ───────────────────────────────────────────────────────

describe("GET /healthz", () => {
  it("should return 200 with status ok", async () => {
    const res = await request(app).get("/healthz");
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("status", "ok");
    expect(res.body).toHaveProperty("uptime");
    expect(typeof res.body.uptime).toBe("number");
  });
});

describe("GET /readyz", () => {
  it("should return 200 or 503 based on DB state", async () => {
    const res = await request(app).get("/readyz");
    // In test env DB is mocked, may be ready or not
    expect([200, 503]).toContain(res.statusCode);
    expect(res.body).toHaveProperty("status");
  });
});

// ── Security Headers ──────────────────────────────────────────────────────

describe("Security Headers", () => {
  it("should have X-Content-Type-Options header", async () => {
    const res = await request(app).get("/healthz");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("should have X-Frame-Options header", async () => {
    const res = await request(app).get("/healthz");
    expect(res.headers["x-frame-options"]).toBeDefined();
  });
});

// ── Frontend Routes ───────────────────────────────────────────────────────

describe("GET /", () => {
  it("should return 200 and serve landing page", async () => {
    const res = await request(app).get("/");
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/html/);
  });
});

describe("GET /admin", () => {
  it("should return 200 and serve admin portal", async () => {
    const res = await request(app).get("/admin");
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/html/);
  });
});

describe("GET /student", () => {
  it("should return 200 and serve student portal", async () => {
    const res = await request(app).get("/student");
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/html/);
  });
});

// ── Meta Endpoint ─────────────────────────────────────────────────────────

describe("GET /meta/violations", () => {
  it("should return violation types and fines", async () => {
    const res = await request(app).get("/meta/violations");
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("Late Return (Curfew)");
    expect(typeof res.body["Late Return (Curfew)"]).toBe("number");
  });
});
