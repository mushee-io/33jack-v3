import postgres from "postgres";
// No in-memory auth fallback. DATABASE_URL must point to the V3 identity database.
let client,initialized;
function connection(){
 if(!process.env.DATABASE_URL)throw Error("Identity database is not configured");
 if(!client)client=postgres(process.env.DATABASE_URL,{max:3,prepare:false,connect_timeout:10,idle_timeout:20});
 return client;
}
export async function identityDB(){
 const sql=connection();
 if(!initialized)initialized=(async()=>{
  const schema=[
  "CREATE TABLE IF NOT EXISTS ama_v3_challenges (id text PRIMARY KEY,address text NOT NULL,origin text NOT NULL,network text NOT NULL CHECK(network='amadeus-testnet'),nonce text NOT NULL,message_hash text NOT NULL,expires_at timestamptz NOT NULL,attempts integer NOT NULL DEFAULT 0,consumed_at timestamptz,created_at timestamptz NOT NULL DEFAULT NOW())",
  "CREATE INDEX IF NOT EXISTS ama_v3_challenge_recent ON ama_v3_challenges(address,created_at DESC)",
  "CREATE TABLE IF NOT EXISTS ama_v3_sessions (token_hash text PRIMARY KEY,address text NOT NULL,origin text NOT NULL,csrf_hash text NOT NULL,expires_at timestamptz NOT NULL,revoked_at timestamptz,created_at timestamptz NOT NULL DEFAULT NOW())",
  "CREATE INDEX IF NOT EXISTS ama_v3_sessions_by_address ON ama_v3_sessions(address,expires_at)",
  "CREATE TABLE IF NOT EXISTS ama_v3_workspaces (id text PRIMARY KEY,name text NOT NULL,created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT NOW())",
  "CREATE TABLE IF NOT EXISTS ama_v3_memberships (workspace_id text NOT NULL REFERENCES ama_v3_workspaces(id) ON DELETE CASCADE,address text NOT NULL,role text NOT NULL CHECK(role IN ('owner','admin','operator','approver','viewer')),created_at timestamptz NOT NULL DEFAULT NOW(),PRIMARY KEY(workspace_id,address))",
  "CREATE INDEX IF NOT EXISTS ama_v3_memberships_by_address ON ama_v3_memberships(address)",
  "CREATE TABLE IF NOT EXISTS ama_v3_invitations (token_hash text PRIMARY KEY,workspace_id text NOT NULL REFERENCES ama_v3_workspaces(id) ON DELETE CASCADE,recipient text NOT NULL,role text NOT NULL CHECK(role IN ('admin','operator','approver','viewer')),created_by text NOT NULL,expires_at timestamptz NOT NULL,consumed_at timestamptz,created_at timestamptz NOT NULL DEFAULT NOW())"
  ];
  for(const command of schema)await sql.unsafe(command);
 })().catch(e=>{initialized=null;throw e});
 await initialized;return sql;
}
export async function getSession(tokenHash){
 const sql=await identityDB();
 const x=await sql.unsafe("SELECT token_hash,address,origin,csrf_hash,expires_at FROM ama_v3_sessions WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>NOW() LIMIT 1",[tokenHash]);
 return x[0]||null;
}
export async function membershipFor(address,workspaceId){
 const sql=await identityDB();
 const x=await sql.unsafe("SELECT workspace_id,address,role FROM ama_v3_memberships WHERE address=$1 AND workspace_id=$2 LIMIT 1",[address,workspaceId]);
 return x[0]||null;
}
export async function membershipsFor(address){
 const sql=await identityDB();
 return sql.unsafe("SELECT m.workspace_id,w.name,m.role FROM ama_v3_memberships m JOIN ama_v3_workspaces w ON w.id=m.workspace_id WHERE m.address=$1 ORDER BY w.created_at ASC",[address]);
}
