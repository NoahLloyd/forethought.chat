export default {
  title: "forethought-bench",
  root: "src",
  output: "dist",
  preserveIndex: true,
  preserveExtension: true,
  interpreters: {
    ".py": ["/srv/agents/repos/forethought.chat/bench/.venv/bin/python3"],
  },
};
