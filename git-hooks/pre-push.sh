#TODO: It's OK for "first iteration", but better implement with smarter environment-based logic
#Should be linked as .git/hooks/pre-push
exit $(npm run test);