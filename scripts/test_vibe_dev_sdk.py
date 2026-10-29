import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))

import vibe_dev_sdk as sdk  # noqa: E402

MALICIOSAS = [
    "--upload-pack=calc/.",
    "ext::sh -c touch% /tmp/x/main",
    "-origin/main",
    "origin/-x",
    "origin/../main",
    "origin/main.lock",
    "",
]


class BaseSeguraTest(unittest.TestCase):
    def test_modelos_recusam_base_maliciosa(self):
        for base in MALICIOSAS:
            with self.subTest(base=base):
                with self.assertRaises(ValueError):
                    sdk.MesaCriarInput(branch="task/x-20261029", dono="claude-local", objetivo="x", base=base)
                with self.assertRaises(ValueError):
                    sdk.MesaAuditarInput(base=base)

    def test_modelos_aceitam_base_legitima(self):
        for base in ["origin/main", "upstream/release/v2", "main"]:
            with self.subTest(base=base):
                self.assertEqual(sdk.MesaAuditarInput(base=base).base, base)

    def test_ferramentas_nao_chamam_node_com_base_maliciosa(self):
        # model_construct pula a validação do pydantic: a ferramenta ainda precisa barrar.
        criar = sdk.MesaCriarInput.model_construct(
            branch="task/x-20261029", dono="claude-local", objetivo="x", repo=".", base="--upload-pack=calc/."
        )
        auditar = sdk.MesaAuditarInput.model_construct(repo=".", dono=None, base="--upload-pack=calc/.")
        with mock.patch.object(sdk, "_run_node_command") as node:
            with self.assertRaises(ValueError):
                sdk.abrir_mesa(criar)
            with self.assertRaises(ValueError):
                sdk.auditar_mesas(auditar)
            node.assert_not_called()


if __name__ == "__main__":
    unittest.main()
