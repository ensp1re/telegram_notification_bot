import { ApiProperty } from "@nestjs/swagger";

export class AccountStatsDto {
  @ApiProperty({ example: 10 }) total!: number;
  @ApiProperty({ example: 8 }) healthy!: number;
  @ApiProperty({ example: 1 }) probation!: number;
  @ApiProperty({ example: 0 }) cooldown!: number;
  @ApiProperty({ example: 0 }) disabled!: number;
  @ApiProperty({ example: 1 }) locked!: number;
}

export class ProxyStatsDto {
  @ApiProperty({ example: 100 }) total!: number;
}

export class QueueStatsDto {
  @ApiProperty({ example: 0 }) depth!: number;
  @ApiProperty({ example: 1000 }) maxSize!: number;
}

export class ConcurrencyStatsDto {
  @ApiProperty({ example: 2 }) active!: number;
  @ApiProperty({ example: 10 }) max!: number;
}

export class AccountHealthSummaryDto {
  @ApiProperty({ example: "healthy" }) status!: string;
  @ApiProperty({ example: 42 }) requests!: number;
  @ApiProperty({ example: 95 }) successRate!: number;
}

export class PoolStatsDto {
  @ApiProperty({ type: AccountStatsDto }) accounts!: AccountStatsDto;
  @ApiProperty({ type: ProxyStatsDto }) proxies!: ProxyStatsDto;
  @ApiProperty({ type: QueueStatsDto }) queue!: QueueStatsDto;
  @ApiProperty({ type: ConcurrencyStatsDto }) concurrency!: ConcurrencyStatsDto;
  @ApiProperty({
    type: "object",
    additionalProperties: { $ref: "#/components/schemas/AccountHealthSummaryDto" },
    example: { elevatorwise: { status: "healthy", requests: 42, successRate: 95 } },
  })
  perAccount!: Record<string, AccountHealthSummaryDto>;
}

export class HealthDto {
  @ApiProperty({ example: "ok" }) status!: string;
  @ApiProperty({ example: "2026-02-19T13:18:32.639Z" }) timestamp!: string;
}
