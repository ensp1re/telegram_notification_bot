import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AccountsStore } from "./accounts.store";
import { ProxyStore } from "./proxy.store";

@Module({
  imports: [ConfigModule],
  providers: [AccountsStore, ProxyStore],
  exports: [AccountsStore, ProxyStore],
})
export class StorageModule {}
