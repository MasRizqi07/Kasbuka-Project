-- Trigger append-only untuk tabel LedgerEntry (PRD US-5 & Hardening 3.3)
CREATE OR REPLACE FUNCTION prevent_ledger_entry_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'LedgerEntry append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ledger_entry_append_only ON "LedgerEntry";

CREATE TRIGGER trg_ledger_entry_append_only
BEFORE UPDATE OR DELETE ON "LedgerEntry"
FOR EACH ROW
EXECUTE FUNCTION prevent_ledger_entry_mutation();

