/**
 * Lua script executed by the Redis snapshot publisher.
 *
 * Argument layout, in order: the snapshot metadata payload, the number of event ids, the
 * event ids themselves, the namespace, then four ARGV entries per event (event key, JSON
 * payload, commune index key, event-commune key).
 */
export const REDIS_SNAPSHOT_SCRIPT = `
local groupSetKey = KEYS[1]
local snapshotMetaKey = KEYS[2]
local metadataPayload = ARGV[1]
local newIdsCount = tonumber(ARGV[2])
local namespace = ARGV[3 + newIdsCount] -- On récupère le namespace dynamiquement

-- 1. Récupération des anciens événements pour calculer le diff
local oldIds = redis.call('SMEMBERS', groupSetKey)
local newIdsSet = {}
if newIdsCount > 0 then
  for i = 1, newIdsCount do
    newIdsSet[ARGV[2 + i]] = true
  end
end

-- 2. Nettoyage des événements supprimés (Orphelins)
for _, oldId in ipairs(oldIds) do
  if not newIdsSet[oldId] then
    local eventKey = namespace .. ':event:' .. oldId
    local eventCommuneKey = eventKey .. ':commune'
    
    local oldCommuneKey = redis.call('GET', eventCommuneKey)
    if oldCommuneKey then
      redis.call('SREM', oldCommuneKey, oldId)
    end
    
    redis.call('DEL', eventKey)
    redis.call('DEL', eventCommuneKey)
  end
end

-- 3. Réécriture du Set du groupe (Sécurisé contre les limites de "unpack")
redis.call('DEL', groupSetKey)
if newIdsCount > 0 then
  local batch = {}
  for i = 1, newIdsCount do
    table.insert(batch, ARGV[2 + i])
    if #batch >= 5000 then
      redis.call('SADD', groupSetKey, unpack(batch))
      batch = {}
    end
  end
  if #batch > 0 then
    redis.call('SADD', groupSetKey, unpack(batch))
  end
end

-- 4. Insertion des événements et mise à jour des index de communes
local eventsStartIndex = 4 + newIdsCount
for i = eventsStartIndex, #ARGV, 4 do
  local eventKey = ARGV[i]
  -- Correction regex : capture tout après :event:
  local eventId = string.match(eventKey, ':event:(.+)$') 
  local payload = ARGV[i + 1]
  local newCommuneKey = ARGV[i + 2]
  local eventCommuneKey = ARGV[i + 3]

  local oldCommuneKey = redis.call('GET', eventCommuneKey)
  if oldCommuneKey and oldCommuneKey ~= newCommuneKey then
    redis.call('SREM', oldCommuneKey, eventId)
  end

  redis.call('SET', eventKey, payload)
  if newCommuneKey ~= '' then
    redis.call('SADD', newCommuneKey, eventId)
    redis.call('SET', eventCommuneKey, newCommuneKey)
  else
    redis.call('DEL', eventCommuneKey)
  end
end

-- 5. Mise à jour des métadonnées
redis.call('SET', snapshotMetaKey, metadataPayload)
return 1`;
