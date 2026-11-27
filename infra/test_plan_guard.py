import unittest
from plan_guard import validate

RG = "rg-landgrab-prod"


def plan(action, resource_type="azurerm_key_vault", after=None):
    after = after if after is not None else {"resource_group_name": RG}
    return {"resource_changes": [{"address": resource_type + ".x", "mode": "managed", "type": resource_type,
                                  "change": {"actions": action, "before": None, "after": after}}]}


class PlanGuardTests(unittest.TestCase):
    def test_allows_vault_creation(self):
        self.assertEqual([], validate(plan(["create"]), RG))

    def test_rejects_delete_and_replacement(self):
        for action in [["delete"], ["delete", "create"], ["create", "delete"]]:
            self.assertTrue(validate(plan(action), RG))

    def test_rejects_other_groups_and_types(self):
        self.assertTrue(validate(plan(["update"], after={"resource_group_name": "rg-timeforguests"}), RG))
        self.assertTrue(validate(plan(["create"], resource_type="azurerm_linux_web_app"), RG))

    def test_role_assignments(self):
        scope = f"/subscriptions/s/resourceGroups/{RG}/providers/Microsoft.KeyVault/vaults/kv-landgrab-prod"
        ok = {"scope": scope, "role_definition_name": "Key Vault Secrets Officer"}
        self.assertEqual([], validate(plan(["create"], "azurerm_role_assignment", ok), RG))
        self.assertTrue(validate(plan(["create"], "azurerm_role_assignment", {**ok, "role_definition_name": "Owner"}), RG))
        self.assertTrue(validate(plan(["create"], "azurerm_role_assignment", {**ok, "scope": "/subscriptions/s"}), RG))
        other = {**ok, "scope": "/subscriptions/s/resourceGroups/shared"}
        self.assertTrue(validate(plan(["create"], "azurerm_role_assignment", other), RG))


if __name__ == "__main__":
    unittest.main()
