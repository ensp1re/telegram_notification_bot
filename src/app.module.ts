import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TwitterModule } from "./twitter/twitter.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TwitterModule,
  ],
})
export class AppModule {}
