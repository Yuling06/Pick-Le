// Builds a WHERE clause + params from req.query, only allowing whitelisted columns.
// Reserved query params (sort) are excluded from filtering.
export function parseFilters(query, allowedFields) {
  const conditions = [];
  const values = [];
  for (const [key, value] of Object.entries(query)) {
    if (key === 'sort') continue;
    if (!allowedFields.includes(key)) continue;
    values.push(value);
    conditions.push(`${key} = $${values.length}`);
  }
  return { where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', values, hasFilters: conditions.length > 0 };
}

// Parses base44-style sort strings like "-created_date" or "created_date"
export function parseSort(sortParam, allowedFields, defaultField = 'created_date') {
  let field = defaultField;
  let direction = 'DESC';
  if (sortParam) {
    const desc = sortParam.startsWith('-');
    const candidate = desc ? sortParam.slice(1) : sortParam;
    if (allowedFields.includes(candidate)) {
      field = candidate;
      direction = desc ? 'DESC' : 'ASC';
    }
  }
  return `ORDER BY ${field} ${direction}`;
}

// Builds a safe "SET col = $n, ..." clause from a whitelist of updatable fields.
export function parseUpdate(body, allowedFields) {
  const sets = [];
  const values = [];
  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      values.push(body[field]);
      sets.push(`${field} = $${values.length}`);
    }
  }
  return { setClause: sets.join(', '), values };
}
