"""
template_loader.py

Resolves a garment_type string (from Gemini's classification)
into the actual .blend path, object name, and reference
measurements for that template.

Adding a new garment template only requires:
    1. Modeling the .blend
    2. Running reference_measurement_extractor.py once against it
    3. Adding one entry to template_registry.json

Nothing else in garment_engine needs to change.
"""

import os
import json


class TemplateNotFoundError(Exception):
    pass


class GarmentTemplate:

    def __init__(self, blend_path, object_name, reference_measurements_path):

        self.blend_path = blend_path
        self.object_name = object_name
        self.reference_measurements_path = reference_measurements_path

    def load_reference_measurements(self):

        with open(self.reference_measurements_path, "r") as file:
            return json.load(file)


class TemplateLoader:

    def __init__(self, templates_root: str, registry_filename: str = "template_registry.json"):

        self.templates_root = templates_root
        self.registry_path = os.path.join(templates_root, registry_filename)

        if not os.path.isfile(self.registry_path):
            raise TemplateNotFoundError(
                f"Template registry not found: {self.registry_path}"
            )

        with open(self.registry_path, "r") as file:
            self.registry = json.load(file)

    def get_template(self, garment_type: str) -> GarmentTemplate:

        garment_type = garment_type.lower().strip()

        if garment_type not in self.registry:

            available = ", ".join(sorted(self.registry.keys()))

            raise TemplateNotFoundError(
                f"Unknown garment_type '{garment_type}'. "
                f"Available templates: {available}"
            )

        entry = self.registry[garment_type]

        return GarmentTemplate(
            blend_path=os.path.join(self.templates_root, entry["blend_path"]),
            object_name=entry["object_name"],
            reference_measurements_path=os.path.join(
                self.templates_root, entry["reference_measurements"]
            )
        )