const Materiel = require("../models/Materiel");

class materielRepository {
    async findById(id) {
        return await Materiel.findById(id);
    }

    async findMaterielById(id) {
        return await this.findById(id);
    }

    async updateFields(id, update) {
        const payload = typeof update === 'string' ? { statut: update } : update;
        return await Materiel.findByIdAndUpdate(
            id,
            payload,
            { new: true, runValidators: true }
        );
    }

    async UpdateMateriel(id, update) {
        return await this.updateFields(id, update);
    }
}

module.exports = new materielRepository();