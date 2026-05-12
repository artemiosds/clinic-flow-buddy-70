mkdir -p data_parts
tables=$(cat tables_list.txt)
for table in $tables; do
  if [ ! -f "data_parts/$table.sql" ]; then
    echo "Dumping $table..."
    pg_dump --data-only --inserts --no-owner --no-privileges --table="public.$table" > "data_parts/$table.sql"
  fi
done
