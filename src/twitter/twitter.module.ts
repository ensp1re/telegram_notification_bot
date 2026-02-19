import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TwitterController } from "./twitter.controller";
import { TwitterService } from "./twitter.service";
import { TwitterClientPoolService } from "./twitter-client-pool.service";
import { StorageModule } from "../storage/storage.module";

@Module({
  imports: [ConfigModule, StorageModule],
  controllers: [TwitterController],
  providers: [TwitterService, TwitterClientPoolService],
  exports: [TwitterService, TwitterClientPoolService],
})
export class TwitterModule {}
