"""
measurement.py

Represents a garment measurement extracted from Gemini.

Example
-------
Measurement(
    name="Bust",
    vertex_group="VG_Bust",
    reference=106,
    target=114
)
"""


class Measurement:
    """
    Stores a single garment measurement.

    Attributes
    ----------
    name
        Human-readable measurement name.

    vertex_group
        The Blender vertex group affected by this measurement.

    reference
        Measurement of the reference garment (cm).

    target
        Desired measurement (cm).
    """

    def __init__(
        self,
        name: str,
        vertex_group: str,
        reference: float,
        target: float
    ):

        if reference <= 0:
            raise ValueError(
                f"{name}: reference measurement must be greater than zero."
            )

        self.name = name
        self.vertex_group = vertex_group
        self.reference = float(reference)
        self.target = float(target)

    @property
    def ratio(self) -> float:
        """
        Scaling ratio.

        Example
        -------
        114 / 106 = 1.075
        """
        return self.target / self.reference

    @property
    def delta(self) -> float:
        """
        Difference in centimeters.

        Example
        -------
        114 - 106 = 8
        """
        return self.target - self.reference

    def __repr__(self):

        return (
            f"Measurement("
            f"name='{self.name}', "
            f"vertex_group='{self.vertex_group}', "
            f"reference={self.reference:.2f}, "
            f"target={self.target:.2f}, "
            f"ratio={self.ratio:.3f})"
        )