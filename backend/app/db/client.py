import json
import jwt
import httpx
from app.config import settings


class _QueryBuilder:
    def __init__(self, client: httpx.Client, url: str, headers: dict, table_name: str):
        self._client = client
        self._base_url = url
        self._headers = dict(headers)
        self._table = table_name
        self._url = f"{url}/rest/v1/{table_name}"
        self._params: dict = {}
        self._method = "GET"
        self._body = None
        self._filters: list[str] = []
        self._select_cols: str | None = None
        self._order_col: str | None = None
        self._order_desc: bool = False
        self._limit_val: int | None = None

    def select(self, cols: str = "*"):
        self._method = "GET"
        self._select_cols = cols
        self._params["select"] = cols
        return self

    def insert(self, data):
        self._method = "POST"
        self._body = data
        self._headers["Prefer"] = "return=representation"
        return self

    def upsert(self, data, on_conflict: str = ""):
        self._method = "POST"
        self._body = data
        self._headers["Prefer"] = "return=representation,resolution=merge-duplicates"
        if on_conflict:
            self._params["on_conflict"] = on_conflict
        return self

    def update(self, data):
        self._method = "PATCH"
        self._body = data
        self._headers["Prefer"] = "return=representation"
        return self

    def delete(self):
        self._method = "DELETE"
        self._headers["Prefer"] = "return=minimal"
        return self

    def eq(self, col: str, val):
        self._params[col] = f"eq.{val}"
        return self

    def neq(self, col: str, val):
        self._params[col] = f"neq.{val}"
        return self

    def in_(self, col: str, vals: list):
        formatted = ",".join(str(v) for v in vals)
        self._params[col] = f"in.({formatted})"
        return self

    def is_(self, col: str, val):
        self._params[col] = f"is.{val}"
        return self

    def like(self, col: str, pattern: str):
        self._params[col] = f"like.{pattern}"
        return self

    def ilike(self, col: str, pattern: str):
        self._params[col] = f"ilike.{pattern}"
        return self

    def order(self, col: str, desc: bool = False):
        direction = "desc" if desc else "asc"
        self._params["order"] = f"{col}.{direction}"
        return self

    def limit(self, n: int):
        self._params["limit"] = str(n)
        return self

    def execute(self):
        if self._method == "GET":
            resp = self._client.get(self._url, params=self._params, headers=self._headers)
        elif self._method == "POST":
            resp = self._client.post(self._url, params=self._params, headers=self._headers, json=self._body)
        elif self._method == "PATCH":
            resp = self._client.patch(self._url, params=self._params, headers=self._headers, json=self._body)
        elif self._method == "DELETE":
            resp = self._client.delete(self._url, params=self._params, headers=self._headers)
        else:
            raise ValueError(f"Unknown method: {self._method}")

        resp.raise_for_status()

        if self._method == "DELETE":
            return []

        data = resp.json()
        if isinstance(data, list):
            return data
        return [data] if data else []


class _StorageClient:
    def __init__(self, client: httpx.Client, base_url: str, headers: dict, bucket_id: str):
        self._client = client
        self._base_url = base_url
        self._headers = headers
        self._bucket = bucket_id

    def upload(self, path: str, file_data: bytes, content_type: str = "application/octet-stream"):
        url = f"{self._base_url}/storage/v1/object/{self._bucket}/{path}"
        headers = {**self._headers, "Content-Type": content_type}
        resp = self._client.post(url, content=file_data, headers=headers)
        resp.raise_for_status()
        return resp.json()

    def download(self, path: str) -> bytes:
        url = f"{self._base_url}/storage/v1/object/{self._bucket}/{path}"
        resp = self._client.get(url, headers=self._headers)
        resp.raise_for_status()
        return resp.content

    def create_signed_url(self, path: str, expires_in: int = 3600) -> str:
        url = f"{self._base_url}/storage/v1/object/sign/{self._bucket}/{path}"
        resp = self._client.post(url, headers=self._headers, json={"expiresIn": expires_in})
        resp.raise_for_status()
        data = resp.json()
        signed_url = data.get("signedURL", "")
        if signed_url.startswith("/"):
            return f"{self._base_url}{signed_url}"
        return signed_url


class _StorageProxy:
    def __init__(self, client: httpx.Client, base_url: str, headers: dict):
        self._client = client
        self._base_url = base_url
        self._headers = headers

    def from_(self, bucket_id: str) -> _StorageClient:
        return _StorageClient(self._client, self._base_url, self._headers, bucket_id)


class _SupabaseDB:
    def __init__(self, url: str, service_role_key: str):
        self._url = url
        self._key = service_role_key
        self._headers = {
            "apikey": service_role_key,
            "Authorization": f"Bearer {service_role_key}",
            "Content-Type": "application/json",
        }
        self._client = httpx.Client(
            timeout=30.0,
            headers=self._headers,
        )
        self.storage = _StorageProxy(self._client, url, self._headers)

    def table(self, name: str) -> _QueryBuilder:
        return _QueryBuilder(self._client, self._url, self._headers, name)

    def rpc(self, function_name: str, params: dict | None = None):
        url = f"{self._url}/rest/v1/rpc/{function_name}"
        resp = self._client.post(url, headers=self._headers, json=params or {})
        resp.raise_for_status()
        return resp.json()


_singleton: _SupabaseDB | None = None


def _db() -> _SupabaseDB:
    global _singleton
    if _singleton is None:
        _singleton = _SupabaseDB(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
    return _singleton


def verify_jwt(token: str) -> str | None:
    """Verify a Supabase auth token and return the user ID.

    Uses Supabase's /auth/v1/user endpoint for verification — this handles
    both HS256 (legacy) and ES256 (current) tokens correctly, checks expiry,
    and respects token revocation.
    """
    if not token or len(token) < 20:
        return None
    try:
        resp = httpx.get(
            f"{settings.SUPABASE_URL}/auth/v1/user",
            headers={
                "apikey": settings.SUPABASE_ANON_KEY,
                "Authorization": f"Bearer {token}",
            },
            timeout=5,
        )
        if resp.status_code == 200:
            user = resp.json()
            return user.get("id")
        return None
    except Exception:
        return None
