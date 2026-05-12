mkdir -p data_parts
while read table; do
  echo "Dumping data for $table..."
  pg_dump --data-only --inserts --no-owner --no-privileges --table="public.$table" > "data_parts/$table.sql"
done < tables_list.txt
