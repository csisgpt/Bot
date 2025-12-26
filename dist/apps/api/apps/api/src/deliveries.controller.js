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
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeliveriesController = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("../../../libs/core/src/index");
const client_1 = require("@prisma/client");
let DeliveriesController = class DeliveriesController {
    constructor(prismaService) {
        this.prismaService = prismaService;
    }
    async listDeliveries(status, destinationId, limit) {
        const where = {};
        if (status) {
            where.status = status;
        }
        if (destinationId) {
            where.destinationId = destinationId;
        }
        const take = Math.min(Number(limit) || 100, 500);
        return this.prismaService.signalDelivery.findMany({
            where,
            include: { signal: true, destination: true },
            orderBy: { createdAt: 'desc' },
            take,
        });
    }
};
exports.DeliveriesController = DeliveriesController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)('status')),
    __param(1, (0, common_1.Query)('destinationId')),
    __param(2, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_a = typeof client_1.DeliveryStatus !== "undefined" && client_1.DeliveryStatus) === "function" ? _a : Object, String, String]),
    __metadata("design:returntype", Promise)
], DeliveriesController.prototype, "listDeliveries", null);
exports.DeliveriesController = DeliveriesController = __decorate([
    (0, common_1.Controller)('deliveries'),
    __metadata("design:paramtypes", [core_1.PrismaService])
], DeliveriesController);
//# sourceMappingURL=deliveries.controller.js.map