"""Offline parse/structural checks only. Never opens a database connection."""
from pathlib import Path
from pglast import parse_sql, parse_plpgsql
from pglast.parser import parse_sql_json
import hashlib
import itertools
import json
root=Path(__file__).resolve().parents[1]
proposal=(root/'docs/private-request-images/proposal.sql').read_text()
read_only=(root/'docs/private-request-images/preflight-read-only.sql').read_text()
assert len(parse_sql(proposal)) >= 20
parse_plpgsql(proposal)
assert all(type(raw.stmt).__name__ in ('TransactionStmt', 'SelectStmt') for raw in parse_sql(read_only)), 'Evidence script must remain SELECT-only'
assert 'BEGIN READ ONLY' in read_only
assert "reviewed_save_md5" in proposal and "reviewed_storage_policies_md5" in proposal
assert "igotu.images.execution_approved" in proposal
assert "storage.allow_only_operation('object.get_authenticated')" in proposal
assert "reviewed_operation_md5" in proposal
assert "IS DISTINCT FROM 'oqalpauljjhytnrpzcqp'" in proposal
assert "AS RESTRICTIVE FOR SELECT TO anon,authenticated" in proposal
assert "AS RESTRICTIVE FOR INSERT TO anon,authenticated" in proposal
assert "AS RESTRICTIVE FOR UPDATE TO anon,authenticated" in proposal
assert "AS RESTRICTIVE FOR DELETE TO anon,authenticated" in proposal
assert "('confirmed','in_progress','completed')" in proposal
assert "workspace('provider')" in proposal and "workspace('client')" in proposal
assert 'DROP POLICY' not in proposal and 'DELETE FROM' not in proposal
assert 'request_image_url=NULL' in proposal and "SET public=false" in proposal
assert 'public=true' not in proposal

def policy_fingerprint_expression(sql):
    start = sql.index('md5(coalesce(string_agg(')
    # This canonical expression contains no parenthesis characters in SQL literals.
    depth = 0
    for i in range(start, len(sql)):
        if sql[i] == '(':
            depth += 1
        elif sql[i] == ')':
            depth -= 1
            if depth == 0:
                return sql[start:i+1]
    raise AssertionError('Unterminated policy fingerprint expression')

def assert_explicit_command_cast(expression):
    tree = json.loads(parse_sql_json('SELECT ' + expression + ' FROM pg_policy'))
    columns, casts = [], []
    def visit(node):
        if isinstance(node, dict):
            col = node.get('ColumnRef', {})
            if col.get('fields') == [{'String': {'sval': 'polcmd'}}]:
                columns.append(col)
            cast = node.get('TypeCast', {})
            if cast.get('arg', {}).get('ColumnRef', {}).get('fields') == [{'String': {'sval': 'polcmd'}}]:
                casts.append(cast['typeName']['names'])
            for value in node.values():
                visit(value)
        elif isinstance(node, list):
            for value in node:
                visit(value)
    visit(tree)
    assert len(columns) == 1 and casts == [[{'String': {'sval': 'text'}}]], 'polcmd must be explicitly cast to text'

canonical = policy_fingerprint_expression(proposal)
snapshot = (root/'docs/private-request-images/rollout/snapshot-read-only.sql').read_text()
assert all(type(raw.stmt).__name__ in ('TransactionStmt', 'SelectStmt') for raw in parse_sql(snapshot))
assert canonical == policy_fingerprint_expression(snapshot), 'Snapshot must use the same canonical policy fingerprint'
assert canonical == policy_fingerprint_expression(read_only), 'Preflight and installation hashes must use the identical canonical expression'
assert 'ORDER BY polname' in canonical
assert_explicit_command_cast(canonical)
# This was syntactically valid before: a parser-only check missed the PG17 overload error.
try:
    assert_explicit_command_cast(canonical.replace('polcmd::text', 'polcmd'))
except AssertionError:
    pass
else:
    raise AssertionError('Regression guard accepted ambiguous text || "char"')

# Deterministic SERIALIZATION MODEL, not a PostgreSQL execution or staging MD5.
rows = [
    dict(name='read_fixture', using="(bucket_id = 'request-images'::text)", check=None, cmd='r', permissive=True, roles='{16445}'),
    dict(name='insert_fixture', using=None, check='(owner_id = (auth.uid())::text)', cmd='a', permissive=False, roles='{16445}'),
]
def model_md5(policies):
    text = '\n'.join('|'.join([r['using'] or '', r['check'] or '', r['name'], r['cmd'], str(r['permissive']).lower(), r['roles']]) for r in sorted(policies, key=lambda r: r['name']))
    return hashlib.md5(text.encode('utf-8')).hexdigest()
expected = 'fa2d2c8fcee9a23f7399545056830cd2'
assert model_md5(rows) == expected
assert all(model_md5(order) == expected for order in itertools.permutations(rows))
assert model_md5([]) == 'd41d8cd98f00b204e9800998ecf8427e'
assert model_md5([dict(rows[0], cmd='a'), rows[1]]) != expected
print('PASS: SQL/PLpgSQL parse, identical canonical expressions, explicit polcmd::text AST and old-bug rejection, deterministic synthetic policy MD5:', expected)
print('No PostgreSQL execution by this test. Independent staging digests are operator-reported evidence, not execution approval; operation tags/live HTTP remain UNVERIFIED.')
