CMD=$(cat <<- EOM
docker-compose \
-p task-melnica \
-f docker-compose.yml
EOM
)


if [ -z "$1" ]
then
  $CMD up --build;
else
  $CMD $@;
fi
