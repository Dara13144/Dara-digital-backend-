import crypto from 'crypto';
import { ENV } from '../../config/env.js';
import { hmacSha512Base64, safeCompare } from '../../utils/crypto.js';
import { logger } from '../../config/logger.js';

/**
 * ABA PayWay Purchase Hash Generator
 * According to official ABA PayWay Merchant Integration Specification:
 * hash = base64(hmac_sha512(key, req_time + merchant_id + tran_id + amount + items + shipping + first_name + last_name + email + phone + type + payment_option + return_url + cancel_url + continue_success_url + return_params))
 */
export function generateAbaPurchaseHash(params) {
  const {
    req_time = '',
    merchant_id = ENV.ABA.MERCHANT_ID,
    tran_id = '',
    amount = '',
    items = '',
    shipping = '',
    first_name = '',
    last_name = '',
    email = '',
    phone = '',
    type = 'purchase',
    payment_option = '',
    return_url = ENV.ABA.RETURN_URL,
    cancel_url = ENV.ABA.CANCEL_URL,
    continue_success_url = '',
    return_params = ''
  } = params;

  const dataString =
    `${req_time}` +
    `${merchant_id}` +
    `${tran_id}` +
    `${amount}` +
    `${items}` +
    `${shipping}` +
    `${first_name}` +
    `${last_name}` +
    `${email}` +
    `${phone}` +
    `${type}` +
    `${payment_option}` +
    `${return_url}` +
    `${cancel_url}` +
    `${continue_success_url}` +
    `${return_params}`;

  const key = ENV.ABA.API_KEY || 'default_key';
  return hmacSha512Base64(key, dataString);
}

/**
 * ABA PayWay Check Transaction Status Hash Generator
 * String: req_time + merchant_id + tran_id
 */
export function generateAbaCheckStatusHash(req_time, tran_id, merchant_id = ENV.ABA.MERCHANT_ID) {
  const dataString = `${req_time}${merchant_id}${tran_id}`;
  const key = ENV.ABA.API_KEY || 'default_key';
  return hmacSha512Base64(key, dataString);
}

/**
 * Verifies Pushback callback hash / signature
 */
export function verifyAbaPushbackHash(reqTime, tranId, status, receivedHash) {
  if (!receivedHash) return false;
  // If sandbox or dev secret mode, verify HMAC SHA512 of pushback data
  const dataString = `${reqTime}${ENV.ABA.MERCHANT_ID}${tranId}${status}`;
  const computedHash = hmacSha512Base64(ENV.ABA.SECRET || ENV.ABA.API_KEY, dataString);
  return safeCompare(computedHash, receivedHash);
}
