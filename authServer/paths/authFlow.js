import { Router } from 'express';
import { PendingAuths, Sessions, Accounts } from '../models.js';
import { getProvider } from '../serviceProvider.js';
import { generateJwt } from '../utils.js';

let app = Router();

app.get('/auth', async function (req, res) {
  const referenceId = req.query.ref;
  if (!referenceId) {
    res.render("error", { error: "The link is broken.", code: "REF_MISSING" });
    return;
  }
  const pendingAuth = await PendingAuths.getByReferenceId(referenceId);
  if (pendingAuth == null) {
    res.render("error", { error: "The link is broken or expired.", code: "REF_INVALID" });
    return;
  }
  const storageType = pendingAuth.storage_type;
  let provider;
  try {
    provider = getProvider(storageType);
  } catch (e) {
    res.render("error", { error: e.message, code: "STORAGE_TYPE_INVALID" });
    return;
  }

  const authUrl = provider.getRedirectUrl(referenceId);
  res.redirect(authUrl);
});

app.get('/callback', async (req, res) => {

  const { state, code } = req.query;
  if (!state || !code) {
    res.render("error", { error: "Invalid Request", code: "PARAMS_MISSING" });
    return;
  }
  const referenceId = state;
  const pendingAuth = await PendingAuths.getByReferenceId(referenceId);
  if (pendingAuth == null) {
    res.render("error", { error: "The link is broken or expired.", code: "REF_INVALID" });
    return;
  }
  const redirectUrl = pendingAuth.redirect_url;

  const storageType = pendingAuth.storage_type;
  let provider;
  try {
    provider = getProvider(storageType);
  } catch (e) {
    res.render("error", { error: e.message, code: "STORAGE_TYPE_INVALID" });
    return;
  }
  let accountDetails;
  try {
    accountDetails = await provider.getAccountDetails(code);
  }
  catch (e) {
    res.render("error", { error: e.message, code: "ACCOUNT_DETAILS_FAILED" });
    return;
  }
  const { id, email, name, picture, refreshToken } = accountDetails;

  let account;
  try {
    account = await Accounts.getOrCreate(id, storageType, refreshToken);
  }
  catch (e) {
    res.render("error", { error: e.message, code: "ACCOUNT_CREATION_FAILED" });
    return;
  }

  await account.updatePublicInfo({ email, name, picture });

  const app = pendingAuth.app;

  if (app.isSettingsApp()) {
    const jwt = generateJwt(account._id.toString());
    pendingAuth.del();
    res.cookie("jwt", jwt, { httpOnly: true });
    res.redirect("/manage");
    return;
  }

  let sessionCreationResult;
  try {
    sessionCreationResult = await Sessions.createFromPendingAuth(pendingAuth, account);
  }
  catch (e) {
    res.render("error", { error: e.message, code: "SESSION_CREATION_FAILED" });
    return;
  }

  res.render("openApp", {
    account,
    app,
    partialCode2: sessionCreationResult.partialCode2,
    referenceId,
    redirectUrl: `${redirectUrl}?partialCode2=${sessionCreationResult.partialCode2}&referenceId=${referenceId}`,
  });
});

export default app;
