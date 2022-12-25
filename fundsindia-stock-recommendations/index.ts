const stockRecommendationObjectKeys = {
  0: "stock",
  2: "cmp",
  3: "stop_loss",
  4: "target",
  5: "time_period",
};

const MAX_INVESTMENT_AMOUT = 25000;

interface IStockRecommendation {
  stock: string;
  cmp: number;
  stop_loss: number;
  target: number;
  time_period: string;
}

const getPortfolioAlert = () => {
  const portfolioAlertThread: GoogleAppsScript.Gmail.GmailThread[] = GmailApp.search(
    "from:info@fundsindia.com AND subject:Portfolio Alert for the Week",
    0,
    1
  );
  const messages: GoogleAppsScript.Gmail.GmailMessage[] = [];
  portfolioAlertThread.forEach((thread) => {
    messages.push(thread.getMessages()[0]);
  });

  return messages[0];
};

const updateStockSheet = (stockRecommendation: IStockRecommendation) => {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[1];
  Logger.log("Adding stock recommendations to: %s", sheet.getName());
  const today = new Date();

  const buyDate = new Date(today);
  buyDate.setDate(today.getDate() + ((1 + 7 - today.getDay()) % 7)); // Next Monday

  const sellDate = new Date(today);
  sellDate.setDate(today.getDate() + 30);
  // Nearest Monday within 30 days
  const weekDay = sellDate.getDay();

  let addDays = 0;
  if (weekDay !== 1) {
    if (weekDay === 0) {
      addDays = 1;
    } else if (addDays <= 3) {
      addDays = -(weekDay - 1);
    } else {
      addDays = 7 - weekDay;
    }
  }

  sellDate.setDate(sellDate.getDate() + addDays);

  sheet.appendRow([
    Utilities.formatDate(today, "Asia/Calcutta", "EEE, MMM dd, YYYY"), // Date
    stockRecommendation.stock,
    stockRecommendation.cmp,
    stockRecommendation.stop_loss,
    stockRecommendation.target,
    stockRecommendation.time_period,
    Utilities.formatDate(buyDate, "Asia/Calcutta", "EEE, MMM dd, YYYY"), // Buy date
    Math.floor(MAX_INVESTMENT_AMOUT / stockRecommendation.cmp), // quantity
    "", // Actual buy price
    "", // gross amount
    Utilities.formatDate(sellDate, "Asia/Calcutta", "EEE, MMM dd, YYYY"),
  ]);
  // Logger.log(Utilities.formatDate(new Date(), "Asia/Calcutta", "EEE, MMM dd, YYYY"));
};

function getWeeklyStockRecommendations() {
  const portfolioAlertMessage = getPortfolioAlert();
  Logger.log(
    "Got the latest portfolio alert message with date: %s",
    portfolioAlertMessage.getDate()
  );
  const content = portfolioAlertMessage.getBody();
  // @ts-ignore
  const $ = Cheerio.load(content);
  const stockTables = $(
    'table:contains("STOCK RECOMMENDATIONS FOR THE UPCOMING WEEK")'
  )
    .last()
    .find("table");
  const stockRow = stockTables.find("tr").eq(1);
  const stockRecommendation: IStockRecommendation = {
    stock: "",
    cmp: 0,
    stop_loss: 0,
    target: 0,
    time_period: "",
  };
  for (let i = 0; i < 6; i++) {
    const key = stockRecommendationObjectKeys[i];
    if (key) {
      stockRecommendation[key] = stockRow.find("td").eq(i).text().trim();
    }
  }
  Logger.log("Extracted stock recommendations: %s", stockRecommendation);
  updateStockSheet(stockRecommendation);
}
