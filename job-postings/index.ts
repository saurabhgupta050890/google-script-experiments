import Cheerio from "cheerio";

const scriptProperties = PropertiesService.getScriptProperties();
const blogId = scriptProperties.getProperty("BLOG_ID");

const extractMonsterMails = () => {
  const monsterJobsThread: GoogleAppsScript.Gmail.GmailThread[] =
    GmailApp.search(
      "from:(opportunities@monsterindia.com) AND newer_than:1d",
      0,
      20
    );
  const messages: GoogleAppsScript.Gmail.GmailMessage[] = [];
  monsterJobsThread.forEach((thread) => {
    messages.push(thread.getMessages()[0]);
  });

  return messages;
};

const retryBucket: { title: string; content: string }[] = [];

const createBlogPost = (title: string, content: string, retry = true) => {
  const postUrl = `https://www.googleapis.com/blogger/v3/blogs/${blogId}/posts`;

  const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true,
    payload: JSON.stringify({
      title: title,
      content: content,
    }),
  };
  const response = UrlFetchApp.fetch(postUrl, options);

  if (
    response.getResponseCode() === 200 ||
    response.getResponseCode() === 201
  ) {
    try {
      const respJson = JSON.parse(response.getContentText());
      return respJson.url;
    } catch (e) {
      Logger.log(e);
      return null;
    }
  } else {
    Logger.log(response.getContentText());
    if (retry) {
      retryBucket.push({
        title: title,
        content: content,
      });
    }
    return null;
  }
};

const prepareMonsterJobPost = (
  message: GoogleAppsScript.Gmail.GmailMessage
) => {
  const subject = message.getSubject();
  const title = subject.replace("(Source: foundit)", "");

  const content = message.getBody();
  const $ = Cheerio.load(content);

  const jobDetailsTable = $("table");
  const jobDetailsHTML = jobDetailsTable
    .find("tr")
    .eq(4)
    .find("td")
    .html()
    ?.replace("Saurabh Gupta", "")
    ?.replace("Dear", "")
    ?.replace(/\d{10}/, "");

  const jobInfoTable = jobDetailsTable.find("tr").eq(7);

  const jobInfoArr = jobInfoTable
    .text()
    .replace("Job Information", "")
    .split("\n")
    .filter((str) => !!str.trim())
    .map((str) => str.trim());

  const jobMeta = jobInfoArr.reduce((acc: string[], o, i, arr) => {
    if (i % 2 === 0) {
      acc.push(`${o}: ${arr[i + 1]}`);
    }
    return acc;
  }, []);

  // Logger.log(jobDetailsHTML);

  const url = createBlogPost(
    title,
    `${jobMeta.join("\n<br />")}<br /><br />${jobDetailsHTML?.trim()}`
  );

  if (url) {
    Logger.log(url);
  }

  Utilities.sleep(5000);
};

const prepareJobPosts = () => {
  const monsterJobs = extractMonsterMails();
  monsterJobs.forEach((message) => {
    prepareMonsterJobPost(message);
  });

  if (retryBucket.length > 0) {
    Utilities.sleep(5000);
    while (retryBucket.length > 0) {
      Logger.log("Retrying failed attempts");
      const post = retryBucket.pop();
      if (post) {
        const url = createBlogPost(post.title, post.content, false);
        if (url) {
          Logger.log(url);
        }
      }
    }
  }
};
