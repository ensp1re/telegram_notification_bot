import "reflect-metadata";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { TwitterClientPoolService } from "../src/twitter/twitter-client-pool.service";
import { AccountsStore } from "../src/storage/accounts.store";
import { ProxyStore } from "../src/storage/proxy.store";

describe("Twitter API (e2e)", () => {
  let app: INestApplication;

  const mockPool = {
    execute: jest.fn(),
    getStats: jest.fn().mockReturnValue({
      accounts: {
        total: 2,
        healthy: 2,
        probation: 0,
        cooldown: 0,
        disabled: 0,
        locked: 0,
      },
      proxies: { total: 5 },
      queue: { depth: 0, maxSize: 1000 },
      concurrency: { active: 0, max: 10 },
      perAccount: {},
    }),
    timeouts: {
      login: 45000,
      search: 60000,
      profile: 30000,
      tweet: 35000,
      default: 30000,
    },
    onModuleInit: jest.fn(),
    onModuleDestroy: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(TwitterClientPoolService)
      .useValue(mockPool)
      .overrideProvider(AccountsStore)
      .useValue({
        onModuleInit: jest.fn(),
        listAccounts: jest.fn().mockReturnValue([]),
        loadCookies: jest.fn().mockReturnValue(null),
        saveCookies: jest.fn(),
        reload: jest.fn(),
      })
      .overrideProvider(ProxyStore)
      .useValue({
        onModuleInit: jest.fn(),
        listProxies: jest.fn().mockReturnValue([]),
        pickRandom: jest.fn().mockReturnValue(undefined),
        count: 0,
        reload: jest.fn(),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("GET /health", () => {
    it("returns status ok", () => {
      return request(app.getHttpServer())
        .get("/health")
        .expect(200)
        .expect((res) => {
          expect(res.body.status).toBe("ok");
          expect(res.body.timestamp).toBeDefined();
        });
    });
  });

  describe("GET /stats", () => {
    it("returns pool statistics", () => {
      return request(app.getHttpServer())
        .get("/stats")
        .expect(200)
        .expect((res) => {
          expect(res.body.accounts.total).toBe(2);
          expect(res.body.proxies.total).toBe(5);
          expect(res.body.queue).toBeDefined();
          expect(res.body.concurrency).toBeDefined();
        });
    });
  });

  describe("GET /tweets/:username", () => {
    it("returns tweets from pool.execute", async () => {
      const fakeTweets = [
        { id: "1", text: "hello" },
        { id: "2", text: "world" },
      ];
      mockPool.execute.mockResolvedValueOnce(fakeTweets);

      const res = await request(app.getHttpServer())
        .get("/tweets/testuser?count=2")
        .expect(200);

      expect(res.body).toEqual(fakeTweets);
    });

    it("returns 502 on timeout errors", async () => {
      mockPool.execute.mockRejectedValueOnce(
        new Error("request timed out"),
      );

      await request(app.getHttpServer())
        .get("/tweets/testuser")
        .expect(502);
    });
  });

  describe("GET /search", () => {
    it("requires q parameter", async () => {
      await request(app.getHttpServer()).get("/search").expect(400);
    });

    it("returns search results", async () => {
      const fakeResult = { tweets: [{ id: "1" }], next: null };
      mockPool.execute.mockResolvedValueOnce(fakeResult);

      const res = await request(app.getHttpServer())
        .get("/search?q=bitcoin&count=5")
        .expect(200);

      expect(res.body).toEqual(fakeResult);
    });
  });

  describe("GET /profile/:username", () => {
    it("returns profile data", async () => {
      const fakeProfile = { username: "test", followersCount: 100 };
      mockPool.execute.mockResolvedValueOnce(fakeProfile);

      const res = await request(app.getHttpServer())
        .get("/profile/test")
        .expect(200);

      expect(res.body.username).toBe("test");
    });
  });

  describe("GET /tweet/:id", () => {
    it("returns a single tweet", async () => {
      const fakeTweet = { id: "123", text: "hi" };
      mockPool.execute.mockResolvedValueOnce(fakeTweet);

      const res = await request(app.getHttpServer())
        .get("/tweet/123")
        .expect(200);

      expect(res.body.id).toBe("123");
    });
  });
});
