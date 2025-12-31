import { ConfigService } from '@nestjs/config';

export interface ProviderEndpoints {
  rest: string;
  ws?: string;
}

export const getProviderEndpoints = (
  configService: ConfigService,
  provider: string,
): ProviderEndpoints => {
  const defaults: Record<string, ProviderEndpoints> = {
    binance: { rest: 'https://data-api.binance.vision', ws: 'wss://stream.binance.com:9443/stream' },
    bybit: { rest: 'https://api.bybit.com', ws: 'wss://stream.bybit.com/v5/public/spot' },
    okx: { rest: 'https://www.okx.com', ws: 'wss://ws.okx.com:8443/ws/v5/public' },
    coinbase: { rest: 'https://api.exchange.coinbase.com', ws: 'wss://ws-feed.exchange.coinbase.com' },
    kraken: { rest: 'https://api.kraken.com', ws: 'wss://ws.kraken.com' },
    kucoin: { rest: 'https://api.kucoin.com' },
    gateio: { rest: 'https://api.gateio.ws/api/v4' },
    mexc: { rest: 'https://api.mexc.com' },
    bitfinex: { rest: 'https://api-pub.bitfinex.com' },
    bitstamp: { rest: 'https://www.bitstamp.net/api/v2' },
    kcex: { rest: 'https://api.kcex.com' },
    twelvedata: { rest: 'https://api.twelvedata.com', ws: 'wss://ws.twelvedata.com/v1/quotes/price' },
    navasan: { rest: 'https://api.navasan.tech' },
    brsapi_market: { rest: 'https://brsapi.ir' },
    bonbast: { rest: 'https://bonbast.com' },
  };

  const envPrefix = provider.toUpperCase();
  const restOverride = configService.get<string>(`${envPrefix}_REST_URL`);
  const wsOverride = configService.get<string>(`${envPrefix}_WS_URL`);
  const defaultsForProvider = defaults[provider] ?? { rest: '', ws: undefined };

  return {
    rest: restOverride ?? defaultsForProvider.rest,
    ws: wsOverride ?? defaultsForProvider.ws,
  };
};
