import { Sequelize, DataTypes, Model } from 'sequelize';
import { envConfig, OptionalType } from './envConfig';
import bcrypt from "bcrypt";
import { validateUsernameString, validatePasswordString } from './utils/profileUtils';

const saltRounds = 10;

class DbModel extends Model {
    static _columns: any;

    get json() {
        return this.toJSON();
    }

    static register(db: Sequelize) {
        super.init( this._columns, { sequelize: db });
    }
}

export class Profile extends DbModel {
    declare id: number;
    declare username: string;
    declare name: string;
    declare isAdmin: boolean;
    declare hash: string;
    declare isDisabled: boolean;

    static _columns = {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        username: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
            validate: {
                isLowercase: true,
                notEmpty: true,
            }
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        isAdmin: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        hash: {
            type: DataTypes.STRING,
            allowNull: true,
            validate: {
                notEmpty: true,
            }
        },
        isDisabled: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
    }

    getDetails() {
        return {
            id: this.id,
            username: this.username,
            name: this.name,
            isAdmin: this.isAdmin,
            isPasswordProtected: this.isPasswordProtected(),
            isDisabled: this.isDisabled,
        }
    }

    async validatePassword(password: string) {
        if(!this.isPasswordProtected()) return true;
        return bcrypt.compare(password, this.hash);
    }

    isPasswordProtected() {
        return !!this.hash;
    }

    static async getProfileByUsername(username: string) {
        return Profile.findOne({ where: { username }});
    }

    static async getProfileById(id: number) {
        return Profile.findByPk(id);
    }

    static async getProfiles(offset: number, limit: number) {
        return Profile.findAll({ offset, limit });
    }

    static async countProfiles() {
        return Profile.count();
    }

    static async createProfile(username: string, name: string, password: string | null = null) {
        let hash: string | null = null;
        if(!envConfig.PROFILES_CONFIG.allowSignups) {
            throw new Error('Signups are disabled');
        }
        if(!password && envConfig.PROFILES_CONFIG.passwordPolicy === OptionalType.Required) {
            throw new Error('Password is required');
        }
        const [valid, str] = validateUsernameString(username);
        if(!valid) {
            throw new Error(str);
        }
        username = str;
        if(!!password) {
            if(envConfig.PROFILES_CONFIG.passwordPolicy === OptionalType.Disabled) {
                throw new Error('Passwords are disabled');
            }
            const [valid, str] = validatePasswordString(password);
            if(!valid) {
                throw new Error(str);
            }
            password = str;
            hash = await bcrypt.hash(password, saltRounds);
        }

        let isAdmin = envConfig.PROFILES_CONFIG.adminIsDefault || await Profile.countProfiles() === 0;
        return await Profile.create({ username, name, hash, isAdmin });
    }
}

export function initModels(db: Sequelize) {
    const classes = [
        Profile,
    ];
    for(const cls of classes) {
        cls.register(db);
    }
}
