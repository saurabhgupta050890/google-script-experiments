interface IMoneyControlSearchSuggestion {
  pdt_dis_nm: string;
  link_src: string;
  link_track: string;
}

interface IMutualFundStock {
  name: string;
  percentage: number;
  scrip?: string;
  sector?: string;
  type?: string;
}

const suggest1 = (data: IMoneyControlSearchSuggestion[]) => data;

const getPortfolioUrl = (url: string) => {
  const baseUrl = url.replace("/nav", "");
  const lastSlash = baseUrl.lastIndexOf("/");
  return (
    baseUrl.substring(0, lastSlash) +
    "/portfolio-holdings" +
    baseUrl.substring(lastSlash)
  );
};

const tableToDistribution = (
  table: any,
  keys: Record<number, string>,
  $: any
): IMutualFundStock[] => {
  const tableRows = table.find("tbody").last().find("tr");
  const columns = Object.keys(keys).map((key) => parseInt(key, 10));
  const distribution: IMutualFundStock[] = [];
  tableRows.each((_idx, el) => {
    // @ts-ignore
    const row = $(el);
    const distributionObj = {};
    columns.forEach((val) => {
      distributionObj[keys[val]] = row
        .find("td")
        .eq(val)
        .text()
        .trim()
        .replace("%", "");
    });
    distribution.push(distributionObj as IMutualFundStock);
  });

  return distribution.map((d) => {
    return {
      ...d,
      percentage: Number(d.percentage),
    };
  });
};

const extractMututalFundDistribution = (portfolioUrl: string) => {
  const resp = UrlFetchApp.fetch(portfolioUrl, { muteHttpExceptions: true });
  // @ts-ignore
  const $ = Cheerio.load(resp.getContentText());
  const equityTable = $("#equityCompleteHoldingTable");
  const debtTable = $("#portfolioDebtTable");
  const othersTable = $("table.portf_others");
  const category = $(".sub_category_text").eq(0).text().trim();
  const updateDate = $(".subtext")
    .map((_idx, el) => {
      const span = $(el);
      return span.text().trim();
    })
    .get()
    .filter((text: string) => {
      return text.startsWith("(as on");
    })[0]
    .replace(/[()]/gi, "")
    .replace(/as\son/gi, "")
    .trim();

  const equityKeys = { 0: "name", 1: "sector", 4: "percentage" };
  const equityDistribution = tableToDistribution(equityTable, equityKeys, $);

  const debtKeys = { 0: "name", 1: "type", 2: "sector", 6: "percentage" };
  const debtDistribution = tableToDistribution(debtTable, debtKeys, $);

  const otherKeys = { 0: "name", 1: "type", 2: "percentage" };
  const otherDistribution = tableToDistribution(othersTable, otherKeys, $);

  const sumPercent = (arr: IMutualFundStock[]) =>
    arr.reduce((acc, cur) => Number((acc + cur.percentage).toFixed(2)), 0);

  return {
    category: category,
    updateAt: updateDate,
    equity: {
      percentage: sumPercent(equityDistribution),
      distribution: equityDistribution,
    },
    debt: {
      percentage: sumPercent(debtDistribution),
      distribution: debtDistribution,
    },
    others: {
      percentage: sumPercent(otherDistribution),
      distribution: otherDistribution,
    },
  };
};

const extractMututalFundDetails = (name: string) => {
  const moneycontrolSearchUrl = `https://www.moneycontrol.com/mccode/common/autosuggestion_solr.php?classic=true&query=${encodeURIComponent(
    name
  )}&type=2&format=json&callback=suggest1`;
  const response = UrlFetchApp.fetch(moneycontrolSearchUrl, {
    muteHttpExceptions: true,
  });
  const suggestions: IMoneyControlSearchSuggestion[] = eval(
    response.getContentText()
  );

  const nearestMatchSuggestion = suggestions.reduce((previous, current) => {
    // @ts-ignore
    const preMatch = StringSimilarity.stringSimilarity(
      previous.pdt_dis_nm,
      name
    );
    // @ts-ignore
    const curMatch = StringSimilarity.stringSimilarity(
      current.pdt_dis_nm,
      name
    );

    return preMatch > curMatch ? previous : current;
  });

  // Logger.log(nearestMatchSuggestion);
  return nearestMatchSuggestion;
};

const prepareMutualFundMaster = () => {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  const data = sheet.getDataRange().getValues();
  const jsonColumnIndex = data[0].indexOf("JSON");

  for (let i = 1; i < data.length; i++) {
    const [mutualFundName, isin, amfi, url, lastUpdated] = data[i];

    let portfolioUrl = "";

    if (url) {
      portfolioUrl = url;
    } else {
      const mf = extractMututalFundDetails(mutualFundName);
      portfolioUrl = getPortfolioUrl(mf.link_src);

      sheet.getRange(i + 1, jsonColumnIndex - 1).setValue(portfolioUrl);
    }

    Logger.log(`Getting data from: ${portfolioUrl}`);
    const mfDistribution = extractMututalFundDistribution(portfolioUrl);

    sheet.getRange(i + 1, jsonColumnIndex).setValue(new Date().toISOString());
    sheet
      .getRange(i + 1, jsonColumnIndex + 1)
      .setValue(JSON.stringify(mfDistribution));
  }
};
