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

let BTCBalanceStart = 0;
let USDTBalanceStart = 0;

// const INDEX_XRP = 67;
const INDEX_USDT = 14;
// const INDEX_BTC = 0;
const PRICE_UPDATE_PERIOD = 5000; // Price update times varies a lot
const ORDER_UPDATE_PERIOD = 3000;

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
    console.log('buyOrderInfo: ', buyOrderInfo, '\n');
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
    console.log('sellOrderInfo: ', sellOrderInfo, '\n');
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
            return 'success';
        }
        await wait(ORDER_UPDATE_PERIOD);
    }

    // console.log('SALE TIMED OUT, CANCELLING \n');
    // await client.cancelOrder({
    //     symbol: 'BTCUSDT',
    //     orderId: sellOrderInfo.orderId,
    // });
    // return 'failure';
}

// Selling mechanism, invokes the 3 functions above as needed
const sell = async (qty, sellingPrice) => {
    console.log('SELLING at ', sellingPrice);
    let sellSuccess;
    while (true) {
        //let {profit, currentPrice} = await calculateProfit();
        // if (profit >= 0.175) {
            let orderId = await makeSellOrder(qty, sellingPrice);
            waitSellOrderCompletion(orderId);
            // if (sellSuccess === 'failure') continue;
            return;
        // }
        // if(profit < -0.2){
        // TODO: Implement stop logic
        // }
        await wait(PRICE_UPDATE_PERIOD);
    }
}

// Main function, entrance point for the program
(async function main() {
    let buySuccess = null;
    let candles = null;

    let accountInfo = await client.accountInfo();
    console.log(accountInfo);
    let BTCBalanceStart = accountInfo.balances[1].free;
    let USDTBalanceStart = accountInfo.balances[6].free;

    while (true) {
        try {
            candles = await client.candles({
                symbol: 'BTCUSDT',
                interval: '1m'
            });

        } catch (e) {
            console.error('ERROR IN getting candles : ', e);
            process.exit(-1);
        }

        let lastCandle = candles[candles.length - 1];
        let prevClosePrice = parseFloat(candles[candles.length - 2].close);
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

        console.log('deltas = low:', low, 'high:', high, 'median:', median, 'moy:', moy, 'lastDelta:', lastDelta, 'nbCandles:'+candles.length);
        console.log('candles = open:', lastCandle.open, 'close:',closePrice, 'low:', lastCandle.low, 'high:', lastCandle.high);

        let buyPrice = (lastCandle.low + lastCandle.close)/2;
        let buyQuantity = 15 / buyPrice;
        let fees = buyQuantity * buyPrice * 0.001 // binance fees

        let networkfees = 0.00000001 * 5 * 632 // satoshis to bitcoin * fee * transaction weight
        let marge = 0.1;
        let shouldSellAt = buyPrice + fees + networkfees + marge;

        console.log('buyPrice: ', buyPrice, 'fees:', fees, 'networkfees:', networkfees, 'marge:',marge, 'buyQty:',buyQuantity);
        console.log('shouldSellAt:', shouldSellAt);
        console.log('buyPrice < flooredShouldSellAt', buyPrice < shouldSellAt);
        //console.log('shouldSellAt < lastCandle.high - median', shouldSellAt <= (lastCandle.high- median));
        console.log('shouldSellAt <= ((lastCandle.high + lastCandle.close)/2)', shouldSellAt <= ((lastCandle.high + lastCandle.close)/2), ((lastCandle.high + lastCandle.close)/2));

        // 1 :
        // buy = low + close / 2 => moyenne entre low et close
        // sell IF shouldSellAt <= (close + high)/2

        // 2:
        // IF open < close : buy (current) -> sell high (ex sell a (current + high)/2)
        // IF open > close : sell (current) -> buy low (ex buy a (current + low)/2)

        // 3 :


        buyQuantity = buyQuantity.toFixed(6);
        buyPrice = buyPrice.toFixed(2);
        shouldSellAt = shouldSellAt.toFixed(2);

        console.log('final= qty:',buyQuantity ,'buyprice: ',buyPrice, 'sellprice:', shouldSellAt);

        if (//lastCandle.low < (closePrice - median) &&
            //!isNaN(lastDelta) && lastDelta < Math.min((median*2), high) &&
            buyPrice < shouldSellAt &&
            shouldSellAt <= ((lastCandle.high + lastCandle.close)/2)) {

            try {
                buySuccess = await buy(buyQuantity, buyPrice);
            } catch (e) {
                console.error('ERROR IN buy(): ', e);
                console.log('RESUMING OPERATIONS\n');
                continue;
            }
            if (buySuccess === 'failure') continue;
            try {
                await sell(buyQuantity, shouldSellAt);
            } catch (e) {
                console.error('ERROR IN sell(): ', e);
                process.exit(-1);
            }
        }
        console.log('countBuyStarted:', countBuyStarted, 'countBuyCompleted:', countBuyCompleted);
        console.log('countSellStarted:', countSellStarted, 'countSellCompleted:', countSellCompleted);
        accountInfo = await client.accountInfo();
        let BTCBalance = parseFloat(accountInfo.balances[1].free);
        let USDTBalance = parseFloat(accountInfo.balances[6].free);

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
