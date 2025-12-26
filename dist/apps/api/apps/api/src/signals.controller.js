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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SignalsController = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("../../../libs/core/src/index");
let SignalsController = class SignalsController {
    constructor(prismaService) {
        this.prismaService = prismaService;
    }
    async listSignals(instrument, interval, from, to, limit) {
        const where = {};
        if (instrument) {
            where.instrument = instrument;
        }
        if (interval) {
            where.interval = interval;
        }
        const timeFilter = {};
        const fromDate = from ? new Date(from) : undefined;
        if (fromDate && !Number.isNaN(fromDate.getTime())) {
            timeFilter.gte = fromDate;
        }
        const toDate = to ? new Date(to) : undefined;
        if (toDate && !Number.isNaN(toDate.getTime())) {
            timeFilter.lte = toDate;
        }
        if (Object.keys(timeFilter).length > 0) {
            where.time = timeFilter;
        }
        const take = Math.min(Number(limit) || 100, 500);
        return this.prismaService.signal.findMany({
            where,
            orderBy: { time: 'desc' },
            take,
        });
    }
};
exports.SignalsController = SignalsController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)('instrument')),
    __param(1, (0, common_1.Query)('interval')),
    __param(2, (0, common_1.Query)('from')),
    __param(3, (0, common_1.Query)('to')),
    __param(4, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], SignalsController.prototype, "listSignals", null);
exports.SignalsController = SignalsController = __decorate([
    (0, common_1.Controller)('signals'),
    __metadata("design:paramtypes", [core_1.PrismaService])
], SignalsController);
//# sourceMappingURL=signals.controller.js.map