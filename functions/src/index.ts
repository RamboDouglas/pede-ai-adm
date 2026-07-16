/**
 * Ponto de entrada das Cloud Functions do Pede-aí.
 *
 * Cada function é definida em seu próprio arquivo e re-exportada aqui.
 * O nome do export (à esquerda) vira o nome da function no Firebase.
 */
import { setGlobalOptions } from 'firebase-functions/v2';

setGlobalOptions({
  region: 'us-central1',
  maxInstances: 10,
});

export { setUserClaims } from './setUserClaims';
export { listTenantUsers } from './listTenantUsers';
export { onOrderWrite } from './onOrderWrite';
