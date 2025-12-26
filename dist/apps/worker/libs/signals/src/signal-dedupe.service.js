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
exports.SignalDedupeService = exports.buildSignalCooldownKey = exports.buildSignalDedupeKey = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const core_1 = require("../../core/src/index");
const toTimeBucket = (time) => Math.floor(time / 60000);
const buildSignalDedupeKey = (signal) => {
    const source = signal.source ?? 'BINANCE';
    return `signal:${source}:${signal.assetType}:${signal.instrument}:${signal.interval}:${signal.strategy}:${signal.side}:${toTimeBucket(signal.time)}`;
};
exports.buildSignalDedupeKey = buildSignalDedupeKey;
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
        const sendAllTv = this.configService.get('TRADINGVIEW_SEND_ALL', 'true') === 'true';
        const source = signal.source ?? 'BINANCE';
        if (sendAllTv && source === 'TRADINGVIEW') {
            return true;
        }
        const dedupeTtl = this.getNumber('SIGNAL_DEDUPE_TTL_SECONDS', 7200);
        const cooldownSeconds = this.getNumber('SIGNAL_MIN_COOLDOWN_SECONDS', 300);
        const dedupeKey = (0, exports.buildSignalDedupeKey)(signal);
        const cooldownKey = (0, exports.buildSignalCooldownKey)(signal);
        const dedupeSet = await this.redisService.set(dedupeKey, '1', 'EX', dedupeTtl, 'NX');
        if (dedupeSet !== 'OK')
            return false;
        if (cooldownSeconds > 0) {
            const cooldownSet = await this.redisService.set(cooldownKey, '1', 'EX', cooldownSeconds, 'NX');
            if (cooldownSet !== 'OK') {
                await this.redisService.del(dedupeKey);
                return false;
            }
        }
        return true;
    }
    getNumber(key, fallback) {
        const raw = this.configService.get(key);
        if (raw === undefined || raw === null || raw === '')
            return fallback;
        const n = typeof raw === 'number' ? raw : Number(raw);
        return Number.isFinite(n) ? n : fallback;
    }
};
exports.SignalDedupeService = SignalDedupeService;
exports.SignalDedupeService = SignalDedupeService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.RedisService,
        config_1.ConfigService])
], SignalDedupeService);
//# sourceMappingURL=signal-dedupe.service.js.map