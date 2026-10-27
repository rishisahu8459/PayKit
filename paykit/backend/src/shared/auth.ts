import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { secret } from './config';
import { header } from './http';
import { safeEqual } from './signature';

/** Merchant servers authenticate with a shared key in the x-merchant-key header. */
export async function merchantAuthorized(e: APIGatewayProxyEventV2): Promise<boolean> {
  const provided = header(e, 'x-merchant-key') ?? '';
  return safeEqual(provided, await secret('merchant-key'));
}
