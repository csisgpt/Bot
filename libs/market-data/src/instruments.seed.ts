import { Instrument, InstrumentMapping } from './models';

export const seedInstruments: Instrument[] = [
  { id: 'btc-usdt', assetType: 'CRYPTO', base: 'BTC', quote: 'USDT', canonicalSymbol: 'BTCUSDT', isActive: true },
  { id: 'eth-usdt', assetType: 'CRYPTO', base: 'ETH', quote: 'USDT', canonicalSymbol: 'ETHUSDT', isActive: true },
  { id: 'bnb-usdt', assetType: 'CRYPTO', base: 'BNB', quote: 'USDT', canonicalSymbol: 'BNBUSDT', isActive: true },
  { id: 'sol-usdt', assetType: 'CRYPTO', base: 'SOL', quote: 'USDT', canonicalSymbol: 'SOLUSDT', isActive: true },
  { id: 'xrp-usdt', assetType: 'CRYPTO', base: 'XRP', quote: 'USDT', canonicalSymbol: 'XRPUSDT', isActive: true },
  { id: 'ada-usdt', assetType: 'CRYPTO', base: 'ADA', quote: 'USDT', canonicalSymbol: 'ADAUSDT', isActive: true },
  { id: 'doge-usdt', assetType: 'CRYPTO', base: 'DOGE', quote: 'USDT', canonicalSymbol: 'DOGEUSDT', isActive: true },
  { id: 'avax-usdt', assetType: 'CRYPTO', base: 'AVAX', quote: 'USDT', canonicalSymbol: 'AVAXUSDT', isActive: true },
  { id: 'matic-usdt', assetType: 'CRYPTO', base: 'MATIC', quote: 'USDT', canonicalSymbol: 'MATICUSDT', isActive: true },
  { id: 'dot-usdt', assetType: 'CRYPTO', base: 'DOT', quote: 'USDT', canonicalSymbol: 'DOTUSDT', isActive: true },
  { id: 'ltc-usdt', assetType: 'CRYPTO', base: 'LTC', quote: 'USDT', canonicalSymbol: 'LTCUSDT', isActive: true },
  { id: 'link-usdt', assetType: 'CRYPTO', base: 'LINK', quote: 'USDT', canonicalSymbol: 'LINKUSDT', isActive: true },
  { id: 'bch-usdt', assetType: 'CRYPTO', base: 'BCH', quote: 'USDT', canonicalSymbol: 'BCHUSDT', isActive: true },
  { id: 'atom-usdt', assetType: 'CRYPTO', base: 'ATOM', quote: 'USDT', canonicalSymbol: 'ATOMUSDT', isActive: true },
  { id: 'uni-usdt', assetType: 'CRYPTO', base: 'UNI', quote: 'USDT', canonicalSymbol: 'UNIUSDT', isActive: true },
  { id: 'etc-usdt', assetType: 'CRYPTO', base: 'ETC', quote: 'USDT', canonicalSymbol: 'ETCUSDT', isActive: true },
  { id: 'fil-usdt', assetType: 'CRYPTO', base: 'FIL', quote: 'USDT', canonicalSymbol: 'FILUSDT', isActive: true },
  { id: 'trx-usdt', assetType: 'CRYPTO', base: 'TRX', quote: 'USDT', canonicalSymbol: 'TRXUSDT', isActive: true },
  { id: 'xlm-usdt', assetType: 'CRYPTO', base: 'XLM', quote: 'USDT', canonicalSymbol: 'XLMUSDT', isActive: true },
  { id: 'apt-usdt', assetType: 'CRYPTO', base: 'APT', quote: 'USDT', canonicalSymbol: 'APTUSDT', isActive: true },
];

const mapProvider = (
  provider: string,
  canonicalSymbol: string,
  providerSymbol: string,
  providerInstId: string,
): InstrumentMapping => ({
  provider,
  canonicalSymbol,
  providerSymbol,
  providerInstId,
  marketType: 'spot',
  isActive: true,
});

export const seedInstrumentMappings: InstrumentMapping[] = [
  ...seedInstruments.map((instrument) =>
    mapProvider('binance', instrument.canonicalSymbol, instrument.canonicalSymbol, instrument.canonicalSymbol),
  ),
  ...seedInstruments.map((instrument) =>
    mapProvider('bybit', instrument.canonicalSymbol, instrument.canonicalSymbol, instrument.canonicalSymbol),
  ),
  ...seedInstruments.map((instrument) =>
    mapProvider('okx', instrument.canonicalSymbol, instrument.canonicalSymbol, `${instrument.base}-${instrument.quote}`),
  ),
];
