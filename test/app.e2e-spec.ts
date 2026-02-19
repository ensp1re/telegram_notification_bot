import "reflect-metadata";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { TwitterClientPoolService } from "../src/twitter/twitter-client-pool.service";
import { AccountsStore } from "../src/storage/accounts.store";
import { ProxyStore } from "../src/storage/proxy.store";
import {
  ApiResponseInterceptor,
  ApiExceptionFilter,
} from "../src/common/api-response";

const PREFIX = "/api/v3";

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
    app.setGlobalPrefix("api/v3");
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    app.useGlobalInterceptors(new ApiResponseInterceptor());
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // -----------------------------------------------------------------------
  // Health / stats
  // -----------------------------------------------------------------------

  describe(`GET ${PREFIX}/health`, () => {
    it("returns wrapped success response with status ok", () => {
      return request(app.getHttpServer())
        .get(`${PREFIX}/health`)
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.data.status).toBe("ok");
          expect(res.body.data.timestamp).toBeDefined();
        });
    });
  });

  describe(`GET ${PREFIX}/stats`, () => {
    it("returns wrapped pool statistics", () => {
      return request(app.getHttpServer())
        .get(`${PREFIX}/stats`)
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.data.accounts.total).toBe(2);
          expect(res.body.data.proxies.total).toBe(5);
          expect(res.body.data.queue).toBeDefined();
          expect(res.body.data.concurrency).toBeDefined();
        });
    });
  });

  // -----------------------------------------------------------------------
  // Tweets
  // -----------------------------------------------------------------------

  describe(`GET ${PREFIX}/tweets/:username`, () => {
    it("returns wrapped tweets from pool.execute", async () => {
      const fakeTweets = [
        { id: "1", text: "hello" },
        { id: "2", text: "world" },
      ];
      mockPool.execute.mockResolvedValueOnce(fakeTweets);

      const res = await request(app.getHttpServer())
        .get(`${PREFIX}/tweets/testuser?count=2`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(fakeTweets);
    });

    it("returns error envelope on timeout errors", async () => {
      mockPool.execute.mockRejectedValueOnce(
        new Error("request timed out"),
      );

      const res = await request(app.getHttpServer())
        .get(`${PREFIX}/tweets/testuser`)
        .expect(502);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // Search
  // -----------------------------------------------------------------------

  describe(`GET ${PREFIX}/search`, () => {
    it("returns error envelope when q parameter is missing", async () => {
      const res = await request(app.getHttpServer())
        .get(`${PREFIX}/search`)
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it("returns wrapped search results", async () => {
      const fakeResult = { tweets: [{ id: "1" }], next: null };
      mockPool.execute.mockResolvedValueOnce(fakeResult);

      const res = await request(app.getHttpServer())
        .get(`${PREFIX}/search?q=bitcoin&count=5`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(fakeResult);
    });
  });

  // -----------------------------------------------------------------------
  // Profile
  // -----------------------------------------------------------------------

  describe(`GET ${PREFIX}/profile/:username`, () => {
    it("returns wrapped profile data", async () => {
      const fakeProfile = { username: "test", followersCount: 100 };
      mockPool.execute.mockResolvedValueOnce(fakeProfile);

      const res = await request(app.getHttpServer())
        .get(`${PREFIX}/profile/test`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.username).toBe("test");
    });
  });

  // -----------------------------------------------------------------------
  // Single tweet
  // -----------------------------------------------------------------------

  describe(`GET ${PREFIX}/tweet/:id`, () => {
    it("returns wrapped single tweet", async () => {
      const fakeTweet = { id: "123", text: "hi" };
      mockPool.execute.mockResolvedValueOnce(fakeTweet);

      const res = await request(app.getHttpServer())
        .get(`${PREFIX}/tweet/123`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe("123");
    });
  });
});
