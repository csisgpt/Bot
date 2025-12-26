"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSignalDedupeKey = exports.SignalDedupeService = exports.buildSignalCooldownKey = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const core_1 = require("../../core/src/index");
const dedupe_1 = require("./dedupe");
Object.defineProperty(exports, "buildSignalDedupeKey", { enumerable: true, get: function () { return dedupe_1.buildSignalDedupeKey; } });
const buildSignalCooldownKey = (signal) => {
    const source = signal.source ?? 'BINANCE';
    return `cooldown:${source}:${signal.assetType}:${signal.instrument}:${signal.interval}:${signal.strategy}`;
};
exports.buildSignalCooldownKey = buildSignalCooldownKey;
let SignalDedupeService = class SignalDedupeService {
    constructor(redisService, configService) {
        this.redisService = redisService;
        this.configService = configService;
    }
    async isAllowed(signal) {
        const dedupeTtl = this.configService.get('SIGNAL_DEDUPE_TTL_SECONDS', 7200);
        const cooldownSeconds = this.configService.get('SIGNAL_MIN_COOLDOWN_SECONDS', 300);
        const dedupeKey = (0, dedupe_1.buildSignalDedupeKey)(signal);
        const cooldownKey = (0, exports.buildSignalCooldownKey)(signal);
        const [dedupeExists, cooldownExists] = await Promise.all([
            this.redisService.get(dedupeKey),
            this.redisService.get(cooldownKey),
        ]);
        if (dedupeExists || cooldownExists) {
            return false;
        }
        await Promise.all([
            this.redisService.set(dedupeKey, '1', 'EX', dedupeTtl),
            this.redisService.set(cooldownKey, '1', 'EX', cooldownSeconds),
        ]);
        return true;
    }
};
exports.SignalDedupeService = SignalDedupeService;
exports.SignalDedupeService = SignalDedupeService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.RedisService,
        config_1.ConfigService])
], SignalDedupeService);
//# sourceMappingURL=signal-dedupe.service.js.map