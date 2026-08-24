\getenv api_password KURUBASE_API_PASSWORD
alter role kurubase_api login password :'api_password';

\getenv identity_admin_password KURUBASE_IDENTITY_ADMIN_PASSWORD
alter role kurubase_identity_admin login password :'identity_admin_password';
