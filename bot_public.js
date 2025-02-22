const Binance = require('binance-api-node').default;
const {StochasticRSI} = require('technicalindicators');
const {test} = require('./config');

// Creates the API caller/requester as an authenticated client, which can make signed calls
const client = Binance({
    apiKey: test.binance.api_key,
    apiSecret: test.binance.secret_key,
    useServerTime: true,
    test: true
});

let countBuyStarted = 0;
let countBuyCompleted = 0;
let countSellStarted = 0;
let countSellCompleted = 0;

const ORDER_UPDATE_PERIOD = 3000;
const TRADE_QTY = 15;

// VARIABLES - Stochastic Relative Strenght Index indicator
let inputStochRSI = {
    values: [],
    rsiPeriod: 14,
    stochasticPeriod: 9,
    kPeriod: 3,
    dPeriod: 3,
};
const STOCHRSI_CALCULATION_PERIOD = 26; // rsiPeriod + stochasticPeriod + kPeriod
const BUY_LIMIT = 5;
// const SELL_LIMIT = 95;

// VARIABLES - Ehlers Filter (Super Smoother Filter)
let filter = [0, 0, 0];
const a = Math.exp(-Math.PI * Math.sqrt(2) / 10);
const c2 = 2 * a * Math.cos(Math.sqrt(2) * Math.PI / 10);
const c3 = -a * a;
const c1 = (1 - c2 - c3) / 2;
// console.log('a: ', a);
// console.log('c1: ', c1);
// console.log('c2: ', c2);
// console.log('c3: ', c3);

// FUNCTIONS

// Pauses execution for a specified amount of time
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// Synchronizes with the Binance API server
const sync = async () => {
    console.log('SYNCING ...');
    let serverTime = await client.time();
    console.log('serverTime: ', serverTime);
    let timeDifference = serverTime % 60000;
    console.log('timeDifference: ', timeDifference);
    await wait(timeDifference + 1000); // Waits 1s more to make sure the prices were updated
    console.log('SYNCED WITH BINANCE SERVER! \n');
}

// Creates a buy order in the Binance API
const makeBuyOrder = async (buyQuantity, currentPrice) => {
    console.log('MAKING BUY ORDER');
    countBuyStarted++;
    let buyOrderInfo = await client.order({
        symbol: 'BTCUSDT',
        side: 'BUY',
        quantity: buyQuantity,
        price: currentPrice,
    });
    return buyOrderInfo.orderId;
}

// Waits till a buy order is completely filled or times out empty
const waitBuyOrderCompletion = async (orderId) => {
    console.log('WAITING BUY ORDER COMPLETION');

    while (true) {
        let buyOrderInfo = await client.getOrder({
            symbol: 'BTCUSDT',
            orderId: orderId,
        });
        if (buyOrderInfo.status === 'FILLED') {
            countBuyCompleted++;
            console.log('PURCHASE COMPLETE! \n');
            console.log('buyOrderInfo: ', buyOrderInfo, '\n');
            return 'success';
        }
        await wait(ORDER_UPDATE_PERIOD);
    }
}

// Purchasing mechanism, invokes the 3 functions above as needed
const buy = async (buyQuantity, price) => {
    console.log('BUYING');
    //let {buyQuantity, currentPrice} = await calculateBuyQuantity(price);
    let orderId = await makeBuyOrder(buyQuantity, price);
    waitBuyOrderCompletion(orderId);
    return 'success';
    // return buySuccess;
}

// Creates a sell order in the Binance API
const makeSellOrder = async (qty, currentPrice) => {
    countSellStarted++;
    console.log('MAKING SELL ORDER');
    let sellOrderInfo = await client.order({
        symbol: 'BTCUSDT',
        side: 'SELL',
        quantity: qty,
        price: currentPrice,
    });
    return sellOrderInfo.orderId;
}

// Waits till a sell order is completely filled or times out empty
const waitSellOrderCompletion = async (orderId) => {
    console.log('WAITING SELL ORDER COMPLETION');

    while (true) {
        let sellOrderInfo = await client.getOrder({
            symbol: 'BTCUSDT',
            orderId: orderId,
        });
        // console.log('sellOrderInfo: ', sellOrderInfo);
        if (sellOrderInfo.status === 'FILLED') {
            countSellCompleted++;
            console.log('SALE COMPLETE! \n');
            console.log('sellOrderInfo: ', sellOrderInfo, '\n');
            return 'success';
        }
        await wait(ORDER_UPDATE_PERIOD);
    }
}

// Selling mechanism, invokes the 3 functions above as needed
const sell = async (qty, sellingPrice) => {
    console.log('SELLING at ', sellingPrice);
    let orderId = await makeSellOrder(qty, sellingPrice);
    waitSellOrderCompletion(orderId);
}

const initializeInputStochRSI = async (candles) => {
    // console.log('INITIALIZING STOCH RSI');
    for(let i = 0, currentClosePrice = null; i <= STOCHRSI_CALCULATION_PERIOD + 3; i++){
        currentClosePrice = candles[(candles.length - 1) - (STOCHRSI_CALCULATION_PERIOD + 3) + i ].close;
        inputStochRSI.values[ i ] = Number(currentClosePrice);
    }
    // console.log('inputStochasticRSI: ', inputStochRSI);
    // console.log('inputStochasticRSI.value.lenght: ', inputStochRSI.values.length, '\n');
}


// Updates the input for the stochastic RSi calculation. It adds the newedt price and removes the oldest one.
const updateInputStochRSI = async (candles) => {
    // console.log('UPDATING STOCH RSI');
    inputStochRSI.values.shift();
    let lastClosePrice = candles[candles.length - 1 ].close;
    inputStochRSI.values.push(Number(lastClosePrice));
    // console.log('lastClosePrice: ', lastClosePrice);
    // console.log('inputStochRSI: ', inputStochRSI, '\n');
}

// Calculates stochastic RSI based on the prices input
const calculateStochRSI = async () => {
    //console.log('CALCULATING STOCH RSI');
    let calculatedStochRSI = StochasticRSI.calculate(inputStochRSI);
   // console.log('calculatedStochRSI: ', calculatedStochRSI, '\n');
    return calculatedStochRSI;
}

// Initializes the Ehlers filter (super smoother)
const initializeSmoother = async (SRSI) => {
    console.log('INITIALIZING SUPER SMOOTHER');
    filter[0] = c1 * (SRSI[1].stochRSI + SRSI[0].stochRSI);
    filter[1] = c1 * (SRSI[2].stochRSI + SRSI[1].stochRSI) + c2 * filter[0];
    filter[2] = c1 * (SRSI[3].stochRSI + SRSI[2].stochRSI) + c2 * filter[1] + c3 * filter[0];
    //console.log('smoothedStochRSI: ', filter[2], '\n');
}

// Calculates next value for the Ehlers filter
const calculateSmoother = async (SRSI) => {
    console.log('CALCULATING SUPER SMOOTHER');
    let newValue = c1 * (SRSI[3].stochRSI + SRSI[2].stochRSI) + c2 * filter[2] + c3 * filter[1];
    filter.push(newValue);
    filter.shift();
    //console.log('smoothedStochRSI: ', filter, '\n');
}

// Main function, entrance point for the program
(async function main() {
    let calculatedStochRSI = null, smoothedStochRSI = null
    let candles = null;

    let accountInfo = await client.accountInfo();
    console.log(accountInfo);
    let BTCBalanceStart = parseFloat(accountInfo.balances[1].free) + parseFloat(accountInfo.balances[1].locked);
    let USDTBalanceStart = parseFloat(accountInfo.balances[6].free) + parseFloat(accountInfo.balances[6].locked);

    try {
        candles = await client.candles({
            symbol: 'BTCUSDT',
            interval: '1m'
        });
        await initializeInputStochRSI(candles);
        calculatedStochRSI = await calculateStochRSI();
        smoothedStochRSI = await initializeSmoother(calculatedStochRSI);
        await sync();
    } catch (e) {
        console.error('ERROR DURING INITIALIZATION: ', e);
        process.exit(-1);
    }

    while (true) {
        try {
            candles = await client.candles({
                symbol: 'BTCUSDT',
                interval: '1m'
            });
        } catch (e) {
            console.error('ERROR IN updating candles(): ', e);
            process.exit(-1);
        }

        try {
            await updateInputStochRSI(candles);
        } catch (e) {
            console.error('ERROR IN updateStochRSI(): ', e);
            process.exit(-1);
        }
        try {
            calculatedStochRSI = await calculateStochRSI();
        } catch (e) {
            console.error('ERROR IN calculateStochRSI(): ', e);
            process.exit(-1);
        }
        try {
            smoothedStochRSI = await calculateSmoother(calculatedStochRSI);
            console.log('SmoothedStockRSI:', smoothedStochRSI);
        } catch (e) {
            console.error('ERROR IN calculateSmoother(): ', e);
            process.exit(-1);
        }

        let lastCandle = candles[candles.length - 1];
        let closePrice = parseFloat(lastCandle.close);
        let deltaSum = 0;
        let lastDelta;
        let deltas = [];

        lastCandle.low = parseFloat(lastCandle.low);
        lastCandle.high = parseFloat(lastCandle.high);
        lastCandle.close = parseFloat(lastCandle.close);
        lastCandle.open = parseFloat(lastCandle.open);

        for(let n = 1; n < candles.length; n++){
            let a = parseFloat(candles[n-1].close);
            let b = parseFloat(candles[n].close);
            let delta = Math.abs(a - b);
            deltaSum += delta;
            deltas.push(delta);
            lastDelta = delta;
        }
        deltas.sort((a, b) => a - b);

        let n = deltas.length - 1;

        let median = (n % 2 === 0)
            ? (deltas[n / 2] + deltas[n / 2 + 1]) / 2
            : deltas[(n + 1) / 2];

        let high = deltas[n];
        let low = deltas[0];
        let moy = deltaSum / deltas.length;

        // console.log('deltas = low:', low, 'high:', high, 'median:', median, 'moy:', moy, 'lastDelta:', lastDelta, 'nbCandles:'+candles.length);
        console.log('candles = open:', lastCandle.open, 'close:',closePrice, 'low:', lastCandle.low, 'high:', lastCandle.high);

        let direction = 'UP';

        if( lastCandle.open > lastCandle.close ){
            direction = 'DOWN';
        }

        let platformFees = TRADE_QTY * 0.001 // binance fees
        let networkFees = 0.00000001 * 5 * 632 // satoshis to bitcoin * fee * transaction weight
        let marge = median;
        let priceChange = (platformFees + networkFees)*2 + marge; // * 2 for fees on buy and fees on sell

        let buyPrice = lastCandle.close - (priceChange/2); // (lastCandle.low + lastCandle.close)/2 ;
        let buyQuantity = TRADE_QTY / buyPrice;

        let sellPrice = lastCandle.close + (priceChange/2);

        buyQuantity = buyQuantity.toFixed(6);
        buyPrice = buyPrice.toFixed(2);
        sellPrice = sellPrice.toFixed(2);


        // 2:
        // IF open < close : buy (current) -> sell high (ex sell a (current + high)/2)
        // IF open > close : sell (current) -> buy low (ex buy a (current + low)/2)

        // 3 : Prendre le prix current et enlever 50% des frais+marge = prix achat, ajouter le meme montant = prix de vente

        console.log('deltas = low:', low, 'high:', high, 'median:', median, 'moy:', moy, 'lastDelta:', lastDelta, 'nbCandles:'+candles.length);
        console.log('buyPrice: ', buyPrice, 'fees:', platformFees, 'networkfees:', networkFees, 'marge:',marge, 'buyQty:',buyQuantity);
        console.log('sellPrice:', sellPrice);
        console.log('buyPrice < sellPrice', buyPrice < sellPrice);
        //console.log('shouldSellAt < lastCandle.high - median', shouldSellAt <= (lastCandle.high- median));
        console.log('sellPrice >= (buyPrice + priceChange)', sellPrice >= (buyPrice + priceChange));
        console.log('buyPrice >= ((lastCandle.low + lastCandle.low +lastCandle.close)/3)', buyPrice >= ((lastCandle.low + lastCandle.low + lastCandle.close)/3));
        console.log('sellPrice <= ((lastCandle.high + lastCandle.high +lastCandle.close)/3)', sellPrice <= ((lastCandle.high + lastCandle.high +lastCandle.close)/3));

        if (buyPrice < sellPrice &&
            sellPrice >= (buyPrice + priceChange) &&
            buyPrice >= ((lastCandle.low + lastCandle.low + lastCandle.close)/3) &&
            sellPrice <= ((lastCandle.high + lastCandle.high + lastCandle.close)/3)
        ) {
            try {
                buy(buyQuantity, buyPrice); // delete away
            } catch (e) {
                console.error('ERROR IN buy(): ', e);
                console.error('RESUMING...');
                continue;
            }
            try {
                await sell(buyQuantity, sellPrice);
            } catch (e) {
                console.error('ERROR IN sell(): ', e);
                process.exit(-1);
            }
        }

        console.log('countBuyStarted:', countBuyStarted, 'countBuyCompleted:', countBuyCompleted);
        console.log('countSellStarted:', countSellStarted, 'countSellCompleted:', countSellCompleted);
        accountInfo = await client.accountInfo();
        let BTCBalance = parseFloat(accountInfo.balances[1].free) + parseFloat(accountInfo.balances[1].locked);
        let USDTBalance = parseFloat(accountInfo.balances[6].free) + parseFloat(accountInfo.balances[6].locked);

        console.log('Balances= BTC:',BTCBalance, ' USDT:',USDTBalance);
        console.log('Profit= BTC:',(BTCBalance-BTCBalanceStart), ' USDT:',(USDTBalance - USDTBalanceStart));
        await sync();
    }
})();

/* TODO
	-> Implement sale stop logic
	-> Study more about technical indicators (particularly StochRSI and Ehlers filters)
		-> Consider using more data points
*/
