const { httpGet, httpPost } = require("./http");
const { APPID, APPSECRET, ENV_ID } = require("./config");

async function getAccessToken() {
  if (!APPID || !APPSECRET) throw new Error("Missing WX_APPID or WX_APPSECRET in .env");
  const res = await httpGet(
    `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APPID}&secret=${APPSECRET}`
  );
  if (!res.access_token) throw new Error("Failed to get access_token: " + JSON.stringify(res));
  return res.access_token;
}

async function invokeCloudFunction(action, data) {
  const token = await getAccessToken();
  const url = `https://api.weixin.qq.com/tcb/invokecloudfunction?access_token=${token}&env=${ENV_ID}&name=quizWriter`;
  const result = await httpPost(url, { action, data });
  if (result.errcode && result.errcode !== 0) throw new Error("WeChat API error: " + JSON.stringify(result));
  const resp = typeof result.resp_data === "string" ? JSON.parse(result.resp_data) : result.resp_data;
  if (!resp || !resp.success) throw new Error("quizWriter error: " + JSON.stringify(resp));
  return resp;
}

async function uploadQuiz(quiz) {
  return invokeCloudFunction("updateQuiz", quiz);
}

async function addQuiz(quiz) {
  return invokeCloudFunction("addQuiz", quiz);
}

async function deleteQuiz(id) {
  return invokeCloudFunction("deleteQuiz", { id });
}

module.exports = { getAccessToken, uploadQuiz, addQuiz, deleteQuiz };
