CREATE UNIQUE INDEX IF NOT EXISTS uq_auto_ledger_entry_source
    ON general_ledger (source_type, source_id)
    WHERE source_type IS NOT NULL
      AND source_id IS NOT NULL
      AND is_voided = false;