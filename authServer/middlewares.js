import { Sessions, Accounts } from './models.js';
import { verifyJwt } from './utils.js';

const asyncHandler = fn => (req, res, next) => {
    fn(req, res, next)
        .catch(next);
};

export function apiResponse(_req, res, next) {
    res.apiSuccess = function (status, body) {
        if (body == undefined) {
            body = status;
            status = 200;
        }
        res.status(status)
            .send(body);
    }
    res.apiError = function (status, message, error = null) {
        res.status(status)
            .send({ message, error });
    }
    next();
}

export const getSession = asyncHandler(async (req, _res, next) => {
    req._session = null;
    const { apiKey, appId } = req.body;
    if (apiKey && appId) {
        req._session = await Sessions.getByApiKey(apiKey, appId);
    }
    next();
});

export const getAccount = asyncHandler(async (req, _res, next) => {
    req._account = null;
    if (req.cookies && req.cookies.jwt) {
        const accountId = verifyJwt(req.cookies.jwt);
        if (accountId) {
            req._account = await Accounts.getById(accountId);
        }
    }
    next();
});
